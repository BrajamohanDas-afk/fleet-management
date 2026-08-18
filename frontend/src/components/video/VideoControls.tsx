import { Play, Square, Save, RotateCcw, Film } from 'lucide-react';

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
        <button type="button" onClick={onStopCameras} className="app-button app-button-danger">
          <Square className="h-4 w-4" />
          Stop Cameras
        </button>
      ) : (
        <button type="button" onClick={onStartCameras} className="app-button app-button-primary">
          <Play className="h-4 w-4" />
          Start Cameras
        </button>
      )}

      <button type="button" onClick={onSaveVideo} className="app-button app-button-secondary">
        <Save className="h-4 w-4" />
        Save Video
      </button>

      <button type="button" onClick={onSavedVideos} className="app-button app-button-secondary">
        <Film className="h-4 w-4" />
        Saved Videos
      </button>

      <button type="button" onClick={onReconnectView} className="app-button app-button-secondary">
        <RotateCcw className="h-4 w-4" />
        Reconnect View
      </button>
    </div>
  );
}