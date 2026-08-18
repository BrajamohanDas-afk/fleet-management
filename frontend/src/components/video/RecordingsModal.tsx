import { useQuery } from '@tanstack/react-query';
import { X, Loader2, Download, Film } from 'lucide-react';
import { getRecordings, getRecordingDownloadUrl } from '../../services/video';
import { formatInIst } from '../../utils/formatDate';
import type { RecordingOut } from '../../types';

interface RecordingsModalProps {
  onClose: () => void;
}

function recordingStatus(recording: RecordingOut): string {
  if (!recording.ended_at) return 'Recording';
  if (recording.size_bytes === null) return 'Unavailable';
  return `${(recording.size_bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function RecordingsModal({ onClose }: RecordingsModalProps) {
  const { data: recordings = [], isLoading, error } = useQuery({
    queryKey: ['recordings'],
    queryFn: getRecordings,
    refetchInterval: 2_000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Saved Videos</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading recordings...
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              Failed to load recordings: {error.message}
            </div>
          )}

          {!isLoading && !error && recordings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Film className="mb-2 h-10 w-10 text-slate-300" />
              <p className="text-sm">No saved recordings yet.</p>
            </div>
          )}

          {!isLoading && !error && recordings.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">Started</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recordings.map((recording) => {
                  const canDownload = Boolean(recording.ended_at) && recording.size_bytes !== null;
                  return (
                    <tr key={recording.id} className="text-slate-700">
                      <td className="py-3">{recording.id}</td>
                      <td className="py-3">CH{recording.channel_no}</td>
                      <td className="py-3">{formatInIst(recording.started_at)}</td>
                      <td className="py-3">{recordingStatus(recording)}</td>
                      <td className="py-3 text-right">
                        {canDownload ? (
                          <a
                            href={getRecordingDownloadUrl(recording.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        ) : (
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                            {recording.ended_at ? 'No file' : 'Pending'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}