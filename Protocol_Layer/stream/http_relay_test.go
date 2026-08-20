package stream

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestParseCameraURLAllowsOnlyHTTPAndHTTPS(t *testing.T) {
	for _, raw := range []string{"http://camera.local/live", "https://camera.local/live"} {
		if _, err := parseCameraURL(raw); err != nil {
			t.Fatalf("expected %s to parse: %v", raw, err)
		}
	}

	for _, raw := range []string{"", "rtsp://camera.local/live", "ftp://camera.local/live", "http:///missing-host"} {
		if _, err := parseCameraURL(raw); err == nil {
			t.Fatalf("expected %s to fail", raw)
		}
	}
}

func TestClassifyCameraMedia(t *testing.T) {
	tests := []struct {
		name        string
		source      string
		contentType string
		want        string
	}{
		{name: "mjpeg content type", source: "http://camera.local/live", contentType: "multipart/x-mixed-replace; boundary=frame", want: FormatMJPEG},
		{name: "snapshot image", source: "http://camera.local/frame", contentType: "image/jpeg", want: FormatSnapshot},
		{name: "hls extension", source: "http://camera.local/live/index.m3u8", contentType: "text/plain", want: FormatHLS},
		{name: "hls content type", source: "http://camera.local/live", contentType: "application/vnd.apple.mpegurl", want: FormatHLS},
		{name: "direct video", source: "http://camera.local/file", contentType: "video/mp4", want: FormatDirectVideo},
		{name: "unsupported html", source: "http://camera.local", contentType: "text/html", want: FormatUnsupported},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := url.Parse(tt.source)
			if err != nil {
				t.Fatal(err)
			}
			if got := classifyCameraMedia(parsed, tt.contentType); got != tt.want {
				t.Fatalf("expected %s, got %s", tt.want, got)
			}
		})
	}
}

func TestRewriteHLSPlaylistRoutesRelativeAndAttributeURIsThroughRelay(t *testing.T) {
	baseURL, err := url.Parse("http://camera.local/live/master.m3u8")
	if err != nil {
		t.Fatal(err)
	}

	playlist := "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\nsegment.ts\nhttp://cdn.example.com/variant.m3u8\n"
	rewritten := rewriteHLSPlaylist(baseURL, playlist)

	if !strings.Contains(rewritten, "/camera-relay/proxy?url=http%3A%2F%2Fcamera.local%2Flive%2Fkey.bin") {
		t.Fatalf("expected key URI to be rewritten, got:\n%s", rewritten)
	}
	if !strings.Contains(rewritten, "/camera-relay/proxy?url=http%3A%2F%2Fcamera.local%2Flive%2Fsegment.ts") {
		t.Fatalf("expected segment URI to be rewritten, got:\n%s", rewritten)
	}
	if !strings.Contains(rewritten, "/camera-relay/proxy?format=hls&url=http%3A%2F%2Fcdn.example.com%2Fvariant.m3u8") {
		t.Fatalf("expected nested playlist URI to be rewritten with hls format, got:\n%s", rewritten)
	}
}

func TestHTTPRelayProxyAutoDetectsSnapshot(t *testing.T) {
	camera := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte("jpeg-frame"))
	}))
	defer camera.Close()

	relay := NewHTTPRelayServer(":0")
	req := httptest.NewRequest(http.MethodGet, "/camera-relay/proxy?url="+url.QueryEscape(camera.URL+"/frame"), nil)
	res := httptest.NewRecorder()

	relay.withCommonHeaders(http.HandlerFunc(relay.handleProxy)).ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); !strings.HasPrefix(got, "image/jpeg") {
		t.Fatalf("expected image/jpeg content type, got %q", got)
	}
	if res.Body.String() != "jpeg-frame" {
		t.Fatalf("unexpected body %q", res.Body.String())
	}
}
