import {
  CameraOff,
  Maximize,
  RefreshCw,
  RotateCcw,
  Play,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useVideoPanelState } from '../../hooks/useVideoPanelState';
import ChannelBadge from './ChannelBadge';
import type { DeviceHealth } from '../../types';

type LayoutMode = 'side-by-side' | 'front-focus' | 'rear-focus';

interface VideoPanelProps {
  streamUrl: string | null;
  channelNo: number;
  label: string;
  layout: LayoutMode;
  health: DeviceHealth | null;
  isFocused?: boolean;
  autoStart?: boolean;
  reconnectSignal?: number;
}

const CONNECTING_TIMEOUT_MS = 10_000;

function formatAge(lastFrameAt: Date | null): string {
  if (!lastFrameAt) return 'unknown';
  const seconds = Math.floor((Date.now() - lastFrameAt.getTime()) / 1000);
  return `${seconds}s ago`;
}

function waitForIceGatheringComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (timeoutId) clearTimeout(timeoutId);
      peer.removeEventListener('icegatheringstatechange', handleChange);
      resolve();
    };
    const handleChange = () => {
      if (peer.iceGatheringState === 'complete') done();
    };

    peer.addEventListener('icegatheringstatechange', handleChange);
    timeoutId = setTimeout(done, 3000);
  });
}

export default function VideoPanel({
  streamUrl,
  channelNo,
  label,
  layout,
  health,
  isFocused = false,
  autoStart = false,
  reconnectSignal = 0,
}: VideoPanelProps) {
  const {
    state,
    isRegistered,
    lastFrameAt,
    connectionKey,
    start,
    stop,
    retry,
    updateHealth,
    onStreamReady,
    onStreamError,
  } = useVideoPanelState({ keepReconnecting: autoStart });
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    updateHealth(health);
  }, [health, updateHealth]);

  useEffect(() => {
    if (autoStart && streamUrl) start();
    else stop();
  }, [autoStart, start, stop, streamUrl]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (reconnectSignal > 0) retry();
  }, [reconnectSignal, retry]);

  useEffect(() => {
    if (state !== 'connecting') {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
      return;
    }

    connectingTimeoutRef.current = setTimeout(() => {
      onStreamError();
    }, CONNECTING_TIMEOUT_MS);

    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
    };
  }, [state, connectionKey, onStreamError]);

  useEffect(() => {
    if (connectionKey === 0 || !videoRef.current || !streamUrl) return;

    const peer = new RTCPeerConnection();
    let sessionUrl: string | null = null;
    let cancelled = false;

    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        void videoRef.current.play();
        onStreamReady();
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        onStreamError();
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') {
        onStreamError();
      }
    };

    const connect = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await waitForIceGatheringComplete(peer);
        const localDescription = peer.localDescription;
        if (!localDescription?.sdp) throw new Error('WebRTC offer was not created');
        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp' },
          body: localDescription.sdp,
        });
        if (!response.ok) throw new Error(`WHEP request failed (${response.status})`);
        const location = response.headers.get('location');
        sessionUrl = location ? new URL(location, streamUrl).href : null;
        const answer = await response.text();
        if (!cancelled) await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      } catch {
        if (!cancelled) onStreamError();
      }
    };
    void connect();

    return () => {
      cancelled = true;
      if (sessionUrl) void fetch(sessionUrl, { method: 'DELETE' }).catch(() => undefined);
      peer.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [connectionKey, streamUrl, onStreamError, onStreamReady]);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, []);

  const handleFullscreen = () => {
    if (videoRef.current?.requestFullscreen) {
      void videoRef.current.requestFullscreen();
    }
  };

  const handleRefresh = () => {
    retry();
  };

  const containerHeight = isFocused
    ? 'h-[34rem]'
    : layout === 'side-by-side'
      ? 'h-[28rem]'
      : 'h-[28rem]';

  const panelClass = [
    'app-animate-up relative overflow-hidden rounded-lg border bg-slate-950 shadow-md',
    containerHeight,
  ].join(' ');

  if (!isRegistered) {
    return (
      <div className={`${panelClass} flex flex-col items-center justify-center px-6 text-center`}>
        <AlertTriangle className="mb-3 h-10 w-10 text-amber-400" />
        <p className="text-sm font-semibold text-white">Camera panel limit reached</p>
        <p className="mt-1 max-w-md text-xs font-medium text-slate-400">
          Up to four camera panels can be active. Stop another panel, then retry {label}.
        </p>
      </div>
    );
  }

  const showVideo = state === 'live' || state === 'degraded';
  const shouldMountVideo = state === 'connecting' || showVideo;

  return (
    <div className={panelClass}>
      <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-slate-950/90 to-transparent" />
      <div className="absolute left-3 top-3 z-20">
        <ChannelBadge label={label} state={state} />
      </div>

      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh stream"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/20"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          title="Fullscreen"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/20"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {state === 'idle' && (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-white/5 text-slate-400">
            <CameraOff className="h-8 w-8" />
          </div>
          <p className="mb-4 text-sm font-semibold text-slate-300">{streamUrl ? 'Stream stopped' : 'Playback URL unavailable'}</p>
          <button
            type="button"
            onClick={start}
            disabled={!streamUrl}
            className="app-button app-button-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            Start Stream
          </button>
        </div>
      )}

      {shouldMountVideo && (
        <div className="relative h-full w-full">
          <video
            key={connectionKey}
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={[
              'h-full w-full object-cover transition-opacity duration-200',
              showVideo ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          {state === 'connecting' && (
            <div className="app-video-scan absolute inset-0 flex flex-col items-center justify-center bg-slate-950">
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-blue-400" />
              <p className="text-sm font-semibold text-white">Connecting...</p>
            </div>
          )}
          {state === 'degraded' && (
            <div className="absolute bottom-3 left-3 z-20 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white">
              Last frame {formatAge(lastFrameAt)}
            </div>
          )}
        </div>
      )}

      {state === 'reconnecting' && (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <CameraOff className="mb-3 h-10 w-10 text-orange-400" />
          <p className="text-sm font-semibold text-white">Connection lost</p>
          <p className="mb-4 text-xs font-medium text-slate-400">
            Last frame {formatAge(lastFrameAt)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={start}
              className="app-button app-button-primary"
            >
              <Play className="h-4 w-4" />
              Start Stream
            </button>
            <button
              type="button"
              onClick={retry}
              className="app-button bg-slate-800 text-white hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4" />
              Reconnect
            </button>
          </div>
        </div>
      )}

      {state === 'offline' && (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <CameraOff className="mb-3 h-10 w-10 text-red-400" />
          <p className="mb-1 text-sm font-semibold text-white">Camera offline</p>
          <p className="mb-4 text-xs font-medium text-slate-400">
            Channel {channelNo} is not reachable.
          </p>
          <button
            type="button"
            onClick={retry}
            className="app-button app-button-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}