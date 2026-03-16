import { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import Badge from "../ui/badge/Badge";

interface StatusLogEntry {
  dateTime: string;
  status: string;
  action: string;
  staffId: string | null;
  notes: string | null;
  trackingId?: string | null;
}

interface StatusLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: StatusLogEntry[];
  getStaffName: (staffId: string | null) => string;
  formatLogDateTime: (dateTime: string) => string;
  formatStatus: (status: string) => string;
  getStatusColor: (status: string) => "primary" | "success" | "warning" | "info";
  getTrackingImageUrl?: (trackingId: string | null) => Promise<string | null>;
  getBaseUrl?: () => string;
}

export default function StatusLogModal({
  isOpen,
  onClose,
  logs,
  getStaffName,
  formatLogDateTime,
  formatStatus,
  getStatusColor,
  getTrackingImageUrl,
  getBaseUrl,
}: StatusLogModalProps) {
  const [trackingImages, setTrackingImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && getTrackingImageUrl) {
      // Load images for all trackings
      const loadImages = async () => {
        const imageMap: Record<string, string> = {};
        const loadingSet = new Set<string>();

        for (const log of logs) {
          if (log.trackingId && !trackingImages[log.trackingId]) {
            loadingSet.add(log.trackingId);
            setLoadingImages(prev => new Set(prev).add(log.trackingId!));
            try {
              const imageUrl = await getTrackingImageUrl(log.trackingId);
              if (imageUrl) {
                imageMap[log.trackingId] = imageUrl;
              }
            } catch (err) {
              console.error(`Error loading image for tracking ${log.trackingId}:`, err);
            } finally {
              setLoadingImages(prev => {
                const newSet = new Set(prev);
                newSet.delete(log.trackingId!);
                return newSet;
              });
            }
          }
        }

        if (Object.keys(imageMap).length > 0) {
          setTrackingImages(prev => ({ ...prev, ...imageMap }));
        }
      };

      loadImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleViewImage = (trackingId: string | null) => {
    if (!trackingId || !trackingImages[trackingId]) return;
    
    const imageUrl = trackingImages[trackingId];
    window.open(imageUrl, '_blank');
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl">
      <div className="p-5">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Status Log
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Riwayat perubahan status order
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  DATE & TIME
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  ACTION
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  USER
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  NOTES
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  GAMBAR
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatLogDateTime(log.dateTime)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Badge size="sm" color={getStatusColor(log.status)}>
                        {formatStatus(log.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {getStaffName(log.staffId) || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {log.notes ? (
                          <span className="break-words">{log.notes}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {log.trackingId ? (
                        loadingImages.has(log.trackingId) ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">Memuat...</span>
                        ) : trackingImages[log.trackingId] ? (
                          <button
                            onClick={() => handleViewImage(log.trackingId!)}
                            className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline cursor-pointer"
                          >
                            Lihat Gambar
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Belum ada data status log
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

