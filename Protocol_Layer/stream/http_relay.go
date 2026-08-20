package stream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

const (
	cameraAcceptHeader = "multipart/x-mixed-replace,image/*,video/*,application/vnd.apple.mpegurl,*/*;q=0.8"
	cameraUserAgent    = "VLC media player"

	FormatAuto        = "auto"
	FormatMJPEG       = "mjpeg"
	FormatSnapshot    = "snapshot"
	FormatHLS         = "hls"
	FormatDirectVideo = "video"
	FormatUnsupported = "unsupported"

	maxHLSPlaylistBytes = 10 << 20
)

// HTTPRelayServer proxies direct HTTP/HTTPS camera media URLs through the
// Protocol_Layer service so browser playback can remain same-origin.
type HTTPRelayServer struct {
	addr         string
	server       *http.Server
	client       *http.Client
	detectClient *http.Client
}

type detectResponse struct {
	URL         string `json:"url"`
	Format      string `json:"format"`
	ContentType string `json:"content_type,omitempty"`
	StatusCode  int    `json:"status_code,omitempty"`
	FinalURL    string `json:"final_url,omitempty"`
}

// NewHTTPRelayServer creates an HTTP camera relay server bound to addr.
func NewHTTPRelayServer(addr string) *HTTPRelayServer {
	relay := &HTTPRelayServer{
		addr:         addr,
		client:       newRelayHTTPClient(0),
		detectClient: newRelayHTTPClient(8 * time.Second),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/camera-relay/health", relay.handleHealth)
	mux.HandleFunc("/camera-relay/detect", relay.handleDetect)
	mux.HandleFunc("/camera-relay/proxy", relay.handleProxy)

	relay.server = &http.Server{
		Addr:              addr,
		Handler:           relay.withCommonHeaders(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	return relay
}

// Start begins serving the HTTP relay endpoint.
func (s *HTTPRelayServer) Start() error {
	if err := s.server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// Stop gracefully shuts down the HTTP relay endpoint.
func (s *HTTPRelayServer) Stop(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func newRelayHTTPClient(timeout time.Duration) *http.Client {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}
}

func (s *HTTPRelayServer) withCommonHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Range, Accept, Content-Type")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *HTTPRelayServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (s *HTTPRelayServer) handleDetect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeRelayError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	source, err := parseCameraURL(r.URL.Query().Get("url"))
	if err != nil {
		writeRelayError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.detectCameraFormat(r.Context(), source)
	if err != nil {
		writeRelayError(w, http.StatusBadGateway, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("failed to encode camera detect response: %v", err)
	}
}

func (s *HTTPRelayServer) handleProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeRelayError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	source, err := parseCameraURL(r.URL.Query().Get("url"))
	if err != nil {
		writeRelayError(w, http.StatusBadRequest, err.Error())
		return
	}

	requestedFormat, err := normalizeRelayFormat(r.URL.Query().Get("format"))
	if err != nil {
		writeRelayError(w, http.StatusBadRequest, err.Error())
		return
	}

	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, source.String(), nil)
	if err != nil {
		writeRelayError(w, http.StatusBadRequest, "invalid source url")
		return
	}
	applyCameraRequestHeaders(upstreamReq)
	copyRequestHeader(r, upstreamReq, "If-Modified-Since")
	copyRequestHeader(r, upstreamReq, "If-None-Match")
	copyRequestHeader(r, upstreamReq, "Range")

	resp, err := s.client.Do(upstreamReq)
	if err != nil {
		writeRelayError(w, http.StatusBadGateway, fmt.Sprintf("camera request failed: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || (resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotModified) {
		copyProxyHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		if r.Method != http.MethodHead {
			_, _ = io.Copy(w, io.LimitReader(resp.Body, 1<<20))
		}
		return
	}

	effectiveFormat := requestedFormat
	if effectiveFormat == FormatAuto {
		effectiveFormat = classifyCameraMedia(source, resp.Header.Get("Content-Type"))
	}
	if effectiveFormat == FormatUnsupported {
		writeRelayError(w, http.StatusUnsupportedMediaType, "direct camera media URL required")
		return
	}

	if effectiveFormat == FormatHLS && r.Method == http.MethodGet {
		s.writeHLSPlaylist(w, resp)
		return
	}

	copyProxyHeaders(w.Header(), resp.Header)
	setDefaultContentType(w.Header(), effectiveFormat)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		return
	}

	if _, err := io.Copy(w, resp.Body); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("camera relay copy failed for %s: %v", source.Redacted(), err)
	}
}

func (s *HTTPRelayServer) detectCameraFormat(ctx context.Context, source *url.URL) (detectResponse, error) {
	result := detectResponse{URL: source.Redacted(), Format: classifyCameraMedia(source, "")}
	if result.Format != FormatUnsupported && result.Format != FormatAuto {
		return result, nil
	}

	resp, err := s.probeCamera(ctx, http.MethodGet, source)
	if err != nil {
		resp, err = s.probeCamera(ctx, http.MethodHead, source)
	}
	if err != nil {
		return result, fmt.Errorf("camera probe failed: %w", err)
	}
	defer resp.Body.Close()

	result.ContentType = resp.Header.Get("Content-Type")
	result.StatusCode = resp.StatusCode
	if resp.Request != nil && resp.Request.URL != nil {
		result.FinalURL = resp.Request.URL.Redacted()
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		result.Format = FormatUnsupported
		return result, nil
	}

	finalURL := source
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL
	}
	result.Format = classifyCameraMedia(finalURL, result.ContentType)
	return result, nil
}

func (s *HTTPRelayServer) probeCamera(ctx context.Context, method string, source *url.URL) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, source.String(), nil)
	if err != nil {
		return nil, err
	}
	applyCameraRequestHeaders(req)
	return s.detectClient.Do(req)
}
func (s *HTTPRelayServer) writeHLSPlaylist(w http.ResponseWriter, resp *http.Response) {
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHLSPlaylistBytes+1))
	if err != nil {
		writeRelayError(w, http.StatusBadGateway, fmt.Sprintf("failed to read hls playlist: %v", err))
		return
	}
	if len(body) > maxHLSPlaylistBytes {
		writeRelayError(w, http.StatusBadGateway, "hls playlist is too large")
		return
	}

	baseURL := resp.Request.URL
	playlist := rewriteHLSPlaylist(baseURL, string(body))
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write([]byte(playlist))
}

func parseCameraURL(raw string) (*url.URL, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, errors.New("url is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}

	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, errors.New("only http and https camera urls are supported")
	}
	if parsed.Host == "" {
		return nil, errors.New("camera url host is required")
	}
	parsed.Scheme = scheme
	return parsed, nil
}

func normalizeRelayFormat(raw string) (string, error) {
	format := strings.ToLower(strings.TrimSpace(raw))
	if format == "" {
		format = FormatAuto
	}

	switch format {
	case FormatAuto, FormatMJPEG, FormatSnapshot, FormatHLS, FormatDirectVideo:
		return format, nil
	default:
		return "", fmt.Errorf("unsupported format %q", raw)
	}
}

func classifyCameraMedia(source *url.URL, contentType string) string {
	ext := strings.ToLower(path.Ext(source.Path))
	switch ext {
	case ".m3u8":
		return FormatHLS
	case ".mjpg", ".mjpeg":
		return FormatMJPEG
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return FormatSnapshot
	case ".mp4", ".webm", ".ogg", ".mov", ".m4v", ".ts":
		return FormatDirectVideo
	}

	mediaType := strings.ToLower(strings.TrimSpace(contentType))
	if parsed, _, err := mime.ParseMediaType(mediaType); err == nil {
		mediaType = parsed
	}

	switch {
	case strings.Contains(mediaType, "multipart/x-mixed-replace"):
		return FormatMJPEG
	case mediaType == "application/vnd.apple.mpegurl" || mediaType == "application/x-mpegurl" || mediaType == "audio/mpegurl":
		return FormatHLS
	case strings.HasPrefix(mediaType, "image/"):
		return FormatSnapshot
	case strings.HasPrefix(mediaType, "video/"):
		return FormatDirectVideo
	case mediaType == "application/octet-stream" && ext != "":
		return FormatDirectVideo
	default:
		return FormatUnsupported
	}
}

func rewriteHLSPlaylist(baseURL *url.URL, playlist string) string {
	lines := strings.SplitAfter(playlist, "\n")
	var builder strings.Builder
	for _, line := range lines {
		lineEnd := ""
		content := line
		if strings.HasSuffix(content, "\n") {
			lineEnd = "\n"
			content = strings.TrimSuffix(content, "\n")
			content = strings.TrimSuffix(content, "\r")
			if strings.HasSuffix(line, "\r\n") {
				lineEnd = "\r\n"
			}
		}

		trimmed := strings.TrimSpace(content)
		switch {
		case trimmed == "":
			builder.WriteString(content)
		case strings.HasPrefix(trimmed, "#"):
			builder.WriteString(rewriteHLSURIAttributes(baseURL, content))
		default:
			builder.WriteString(rewriteHLSMediaURI(baseURL, trimmed))
		}
		builder.WriteString(lineEnd)
	}
	return builder.String()
}

func rewriteHLSURIAttributes(baseURL *url.URL, line string) string {
	const marker = `URI="`
	var builder strings.Builder
	remaining := line

	for {
		idx := strings.Index(remaining, marker)
		if idx == -1 {
			builder.WriteString(remaining)
			return builder.String()
		}

		builder.WriteString(remaining[:idx+len(marker)])
		remaining = remaining[idx+len(marker):]
		end := strings.Index(remaining, `"`)
		if end == -1 {
			builder.WriteString(remaining)
			return builder.String()
		}

		uri := remaining[:end]
		builder.WriteString(rewriteHLSMediaURI(baseURL, uri))
		remaining = remaining[end:]
	}
}

func rewriteHLSMediaURI(baseURL *url.URL, mediaURI string) string {
	resolved, ok := resolveRelayTarget(baseURL, mediaURI)
	if !ok {
		return mediaURI
	}

	format := FormatAuto
	if strings.EqualFold(path.Ext(resolved.Path), ".m3u8") {
		format = FormatHLS
	}
	return buildRelayProxyURL(resolved, format)
}

func resolveRelayTarget(baseURL *url.URL, mediaURI string) (*url.URL, bool) {
	trimmed := strings.TrimSpace(mediaURI)
	if trimmed == "" || strings.HasPrefix(trimmed, "data:") || strings.HasPrefix(trimmed, "skd:") || strings.HasPrefix(trimmed, "urn:") {
		return nil, false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, false
	}
	resolved := baseURL.ResolveReference(parsed)
	scheme := strings.ToLower(resolved.Scheme)
	return resolved, scheme == "http" || scheme == "https"
}

func buildRelayProxyURL(source *url.URL, format string) string {
	values := url.Values{}
	values.Set("url", source.String())
	if format != "" && format != FormatAuto {
		values.Set("format", format)
	}
	return "/camera-relay/proxy?" + values.Encode()
}

func applyCameraRequestHeaders(req *http.Request) {
	req.Header.Set("Accept", cameraAcceptHeader)
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", cameraUserAgent)
	}
}

func copyRequestHeader(from *http.Request, to *http.Request, key string) {
	if value := from.Header.Get(key); value != "" {
		to.Header.Set(key, value)
	}
}

func copyProxyHeaders(dst http.Header, src http.Header) {
	for _, key := range []string{"Accept-Ranges", "Cache-Control", "Content-Length", "Content-Range", "Content-Type", "ETag", "Last-Modified"} {
		if value := src.Values(key); len(value) > 0 {
			dst.Del(key)
			for _, v := range value {
				dst.Add(key, v)
			}
		}
	}
}

func setDefaultContentType(headers http.Header, format string) {
	if headers.Get("Content-Type") != "" {
		return
	}

	switch format {
	case FormatMJPEG:
		headers.Set("Content-Type", "multipart/x-mixed-replace")
	case FormatSnapshot:
		headers.Set("Content-Type", "image/jpeg")
	case FormatHLS:
		headers.Set("Content-Type", "application/vnd.apple.mpegurl")
	case FormatDirectVideo:
		headers.Set("Content-Type", "video/mp4")
	default:
		headers.Set("Content-Type", "application/octet-stream")
	}
}

func writeRelayError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}
