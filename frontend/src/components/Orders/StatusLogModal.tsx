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
  /** Untuk baris RECEIVED: id order agar gambar diambil dari media model Order */
  orderId?: string;
}

function getLogImageCacheKey(log: StatusLogEntry): string | null {
  if (log.trackingId) return log.trackingId;
  if (log.status === "RECEIVED" && log.orderId) return `received:${log.orderId}`;
  return null;
}

interface StatusLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: StatusLogEntry[];
  getStaffName: (staffId: string | null) => string;
  formatLogDateTime: (dateTime: string) => string;
  formatStatus: (status: string) => string;
  getStatusColor: (status: string) => "primary" | "success" | "warning" | "info";
  /** Resolve URL gambar satu baris (RECEIVED = Order/images, lainnya = OrderTracking/status_update) */
  getRowImageUrl?: (log: StatusLogEntry) => Promise<string | null>;
}

export default function StatusLogModal({
  isOpen,
  onClose,
  logs,
  getStaffName,
  formatLogDateTime,
  formatStatus,
  getStatusColor,
  getRowImageUrl,
}: StatusLogModalProps) {
  const [rowImageUrls, setRowImageUrls] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !getRowImageUrl) return;

    let cancelled = false;

    (async () => {
      const imageMap: Record<string, string> = {};
      for (const log of logs) {
        const cacheKey = getLogImageCacheKey(log);
        if (!cacheKey) continue;

        setLoadingImages((prev) => new Set(prev).add(cacheKey));
        try {
          const imageUrl = await getRowImageUrl(log);
          if (imageUrl && !cancelled) {
            imageMap[cacheKey] = imageUrl;
          }
        } catch (err) {
          console.error(`Error loading image for log row ${cacheKey}:`, err);
        } finally {
          setLoadingImages((prev) => {
            const next = new Set(prev);
            next.delete(cacheKey);
            return next;
          });
        }
      }
      if (!cancelled && Object.keys(imageMap).length > 0) {
        setRowImageUrls((prev) => ({ ...prev, ...imageMap }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // getRowImageUrl harus stabil (useCallback di induk)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, logs]);

  useEffect(() => {
    if (!isOpen) {
      setRowImageUrls({});
      setLoadingImages(new Set());
    }
  }, [isOpen]);

  const handleViewImage = (cacheKey: string | null) => {
    if (!cacheKey || !rowImageUrls[cacheKey]) return;
    setPreviewImage(rowImageUrls[cacheKey]);
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
                logs.map((log, index) => {
                  const imageKey = getLogImageCacheKey(log);
                  return (
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
                      {imageKey ? (
                        loadingImages.has(imageKey) ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">Memuat...</span>
                        ) : rowImageUrls[imageKey] ? (
                          <button
                            type="button"
                            onClick={() => handleViewImage(imageKey)}
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
                );
                })
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

      {/* Image Preview Modal (Lightbox) */}
      <Modal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        className="max-w-4xl !bg-transparent !shadow-none"
        showCloseButton={true}
      >
        <div className="flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="relative group">
            <img
              src={previewImage || ""}
              alt="Bukti Foto Status"
              className="max-h-[85vh] w-auto rounded-2xl shadow-2xl ring-4 ring-white/10 dark:ring-black/20 object-contain animate-in fade-in zoom-in duration-300"
            />
            {/* Download/Full view link as fallback */}
            <a
              href={previewImage || "#"}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-4 right-4 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-all hover:bg-white/20 opacity-0 group-hover:opacity-100"
            >
              Buka File Asli
            </a>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

