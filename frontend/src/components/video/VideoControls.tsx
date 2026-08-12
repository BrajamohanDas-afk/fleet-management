import {
  Play,
  Square,
  Save,
  RotateCcw,
  Film,
} from 'lucide-react';

interface VideoControlsProps {
  isStreaming: boolean;
  onStartCameras: () => void;
  onStopCameras: () => void;
  onSaveVideo: () => void;
  onReconnectView: () => void;
  onSavedVideos: () => void;
}

export default function VideoControls({
  isStreaming,
  onStartCameras,
  onStopCameras,
  onSaveVideo,
  onReconnectView,
  onSavedVideos,
}: VideoControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isStreaming ? (
        <button
          type="button"
          onClick={onStopCameras}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <Square className="h-4 w-4" />
          Stop Cameras
        </button>
      ) : (
        <button
          type="button"
          onClick={onStartCameras}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Play className="h-4 w-4" />
          Start Cameras
        </button>
      )}

      <button
        type="button"
        onClick={onSaveVideo}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        <Save className="h-4 w-4" />
        Save Video
      </button>

      <button
        type="button"
        onClick={onSavedVideos}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        <Film className="h-4 w-4" />
        Saved Videos
      </button>

      <button
        type="button"
        onClick={onReconnectView}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        <RotateCcw className="h-4 w-4" />
        Reconnect View
      </button>
    </div>
  );
}
