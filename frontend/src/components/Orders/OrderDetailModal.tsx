import { useEffect, useState } from "react";
import { mediaAPI, getMediaUrl, MediaUploadRecord } from "../../utils/api";

export type OrderTrackingRow = {
  id: string;
  order_id: string;
  staff_id: string | null;
  status_to: string;
  notes: string | null;
  created_at: string;
};

export type OrderData = {
  id: string;
  order_number: string;
  current_status: string;
  total_items: number;
  free_items_used: number;
  paid_items_count: number;
  additional_fee: number;
  total_addon_fee: number;
  created_at: string | null;
  addons?: Array<{
    name: string;
    count: number;
    price: number;
    subtotal: number;
  }>;
  trackings?: OrderTrackingRow[];
};

const translateStatus = (status: string) => {
  const map: Record<string, string> = {
    RECEIVED: "Diterima",
    WASHING: "Cuci/Kering",
    IRONING: "Setrika",
    WASHING_IRONING: "Cuci-setrika",
    WASHING_DRYING: "Cuci/Kering",
    COMPLETED: "Selesai",
    PICKED_UP: "Diambil",
  };
  return map[status] || status;
};

const getStatusPillClass = (status: string) => {
  const map: Record<string, string> = {
    RECEIVED: "pill-received",
    WASHING: "pill-process",
    IRONING: "pill-process",
    WASHING_IRONING: "pill-process",
    WASHING_DRYING: "pill-process",
    COMPLETED: "pill-completed",
    PICKED_UP: "pill-picked",
  };
  return map[status] || "";
};

const formatRupiah = (amount: number) =>
  `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function OrderDetailModal({
  order,
  appName,
  onClose,
}: {
  order: OrderData;
  appName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [receiptPhotos, setReceiptPhotos] = useState<MediaUploadRecord[]>([]);
  const [statusGalleries, setStatusGalleries] = useState<
    { label: string; subtitle: string; items: MediaUploadRecord[] }[]
  >([]);
  const [fullScreen, setFullScreen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMedia() {
      setLoading(true);
      setLoadError(null);
      try {
        const orderRes = await mediaAPI.getMediaByModel("Order", order.id, "images");
        const receipt = orderRes.success
          ? (Array.isArray(orderRes.data) ? orderRes.data : []) as MediaUploadRecord[]
          : [];
        if (cancelled) return;
        setReceiptPhotos(receipt);

        const trackings = [...(order.trackings || [])].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const galleries: {
          label: string;
          subtitle: string;
          items: MediaUploadRecord[];
        }[] = [];

        for (const t of trackings) {
          if (t.status_to === "RECEIVED") continue;
          const tr = await mediaAPI.getMediaByModel(
            "OrderTracking",
            t.id,
            "status_update"
          );
          const imgs = tr.success ? (Array.isArray(tr.data) ? tr.data : []) as MediaUploadRecord[] : [];
          if (imgs.length === 0) continue;
          galleries.push({
            label: translateStatus(t.status_to),
            subtitle: formatDateTime(t.created_at),
            items: imgs,
          });
        }

        if (!cancelled) setStatusGalleries(galleries);
      } catch {
        if (!cancelled) setLoadError("Gagal memuat foto. Coba tutup dan buka lagi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMedia();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.trackings]);

  return (
    <div className="pi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="pi-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pi-modal-title"
        aria-modal="true"
      >
        <div className="pi-modal__head">
          <div>
            <p className="pi-modal__eyebrow">{appName}</p>
            <h2 id="pi-modal-title" className="pi-modal__title">
              {order.order_number}
            </h2>
            <p className="pi-modal__meta">{formatDateTime(order.created_at)}</p>
          </div>
          <button
            type="button"
            className="pi-modal__close"
            onClick={onClose}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <div className="pi-modal__body">
          <div className="pi-summary">
            <div className="pi-summary__row">
              <span className="pi-muted">Status order</span>
              <span
                className={`status-pill ${getStatusPillClass(order.current_status)}`}
              >
                {translateStatus(order.current_status)}
              </span>
            </div>
            <div className="pi-summary__row">
              <span className="pi-muted">Total pakaian</span>
              <span className="pi-strong">{order.total_items} item</span>
            </div>
            <div className="pi-summary__sub">
              <span>Kuota gratis</span>
              <span>{order.free_items_used} item</span>
            </div>
            {order.paid_items_count > 0 && (
              <div className="pi-summary__sub">
                <span>Berbayar ({order.paid_items_count} item)</span>
                <span>{formatRupiah(order.additional_fee)}</span>
              </div>
            )}
          </div>

          {order.addons && order.addons.length > 0 && (
            <div className="pi-block">
              <h3 className="pi-block__title">Layanan tambahan</h3>
              <ul className="pi-addon-list">
                {order.addons.map((a, i) => (
                  <li key={i} className="pi-addon-list__item">
                    <span>
                      {a.name} × {a.count}
                    </span>
                    <span>{formatRupiah(a.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pi-block">
            <h3 className="pi-block__title">Foto &amp; bukti</h3>
            {loadError && <p className="pi-error">{loadError}</p>}
            {loading ? (
              <div className="pi-skeleton-grid" aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="pi-skeleton" />
                ))}
              </div>
            ) : (
              <>
                <div className="pi-photo-section">
                  <h4 className="pi-photo-section__title">Saat penerimaan</h4>
                  {receiptPhotos.length > 0 ? (
                    <div className="pi-gallery">
                      {receiptPhotos.map((img, i) => {
                        const url = getMediaUrl(img.url);
                        if (!url) return null;
                        return (
                          <button
                            key={`r-${img.id}-${i}`}
                            type="button"
                            className="pi-gallery__btn"
                            onClick={() => setFullScreen(url)}
                          >
                            <img src={url} alt="" loading="lazy" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="pi-muted pi-photo-section__empty">
                      Belum ada foto penerimaan.
                    </p>
                  )}
                </div>

                {statusGalleries.map((g, gi) => (
                  <div key={gi} className="pi-photo-section">
                    <h4 className="pi-photo-section__title">
                      {g.label}
                      <span className="pi-photo-section__time">{g.subtitle}</span>
                    </h4>
                    <div className="pi-gallery">
                      {g.items.map((img, i) => {
                        const url = getMediaUrl(img.url);
                        if (!url) return null;
                        return (
                          <button
                            key={`g-${gi}-${img.id}-${i}`}
                            type="button"
                            className="pi-gallery__btn"
                            onClick={() => setFullScreen(url)}
                          >
                            <img src={url} alt="" loading="lazy" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {!loading &&
                  receiptPhotos.length === 0 &&
                  statusGalleries.length === 0 && (
                    <p className="pi-muted">Tidak ada foto untuk order ini.</p>
                  )}
              </>
            )}
          </div>
        </div>

        <div className="pi-modal__foot">
          <button type="button" className="pi-btn pi-btn--primary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>

      {fullScreen && (
        <div
          className="pi-lightbox"
          onClick={() => setFullScreen(null)}
          role="presentation"
        >
          <button
            type="button"
            className="pi-lightbox__close"
            onClick={() => setFullScreen(null)}
            aria-label="Tutup"
          >
            ×
          </button>
          <img src={fullScreen} alt="Pratinjau" className="pi-lightbox__img" />
        </div>
      )}
    </div>
  );
}
