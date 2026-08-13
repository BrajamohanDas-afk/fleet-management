import { useState } from 'react';
import { X, Loader2, CheckCircle2, Download } from 'lucide-react';
import { startRecording, getRecordingDownloadUrl } from '../../services/video';
import type { DeviceChannelOut, RecordingOut } from '../../types';

const DEFAULT_DURATION_S = 60;
const MAX_DURATION_S = 300;

interface SaveVideoModalProps {
  deviceId: number;
  channels: DeviceChannelOut[];
  preselectedChannelNo?: number;
  onClose: () => void;
}

export default function SaveVideoModal({
  deviceId,
  channels,
  preselectedChannelNo,
  onClose,
}: SaveVideoModalProps) {
  const [channelNo, setChannelNo] = useState<number>(
    preselectedChannelNo ?? channels[0]?.channel_no ?? 1
  );
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION_S);
  const [recording, setRecording] = useState<RecordingOut | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const result = await startRecording(deviceId, {
        channel_no: channelNo,
        duration_s: Math.min(Math.max(1, duration), MAX_DURATION_S),
      });
      setRecording(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Save Video</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {recording ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-800">
                  Recording started
                </p>
                <p className="text-xs text-emerald-700">
                  Channel {recording.channel_no} • {duration}s
                </p>
              </div>
            </div>
            <a
              href={getRecordingDownloadUrl(recording.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Download className="h-4 w-4" />
              Download when ready
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="channel"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Channel
              </label>
              <select
                id="channel"
                value={channelNo}
                onChange={(e) => setChannelNo(Number(e.target.value))}
                className="app-select w-full"
              >
                {channels.map((channel) => (
                  <option key={channel.channel_no} value={channel.channel_no}>
                    {channel.label} (CH{channel.channel_no})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="duration"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Duration (seconds)
              </label>
              <input
                id="duration"
                type="number"
                min={1}
                max={MAX_DURATION_S}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Default {DEFAULT_DURATION_S}s, max {MAX_DURATION_S}s.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Start Recording
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
