import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  invoiceAPI,
  mediaAPI,
  getMediaUrl,
  MediaUploadRecord,
  settingAPI,
} from "../../utils/api";
import "./PublicInvoice.css";

type InvoiceStatus = "unpaid" | "waiting_confirmation" | "paid" | "cancelled";

interface OrderTrackingRow {
  id: string;
  order_id: string;
  staff_id: string | null;
  status_to: string;
  notes: string | null;
  created_at: string;
}

interface OrderData {
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
}

interface InvoiceData {
  id: string;
  invoice_number: string;
  student_id: string;
  billing_period: string;
  total_amount: number;
  status: InvoiceStatus;
  paid_at: string | null;
  student?: {
    fullname: string;
    student_number?: string | null;
    unique_code?: string | null;
  };
  orders?: OrderData[];
}

function mediaListFromResponse(data: unknown): MediaUploadRecord[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as MediaUploadRecord[];
  
  // Handle WebResponse wrapper or nested media property
  const d = data as any;
  if (d.data && Array.isArray(d.data)) return d.data;
  if (Array.isArray(d.media)) return d.media;
  
  return [];
}

function resolveSettingImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  const u = raw.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  // Uses robust utility in api.ts which now defaults to direct static paths (/uploads/...)
  // confirmed to work via Nginx/FastAPI static mount.
  return getMediaUrl(u);
}

const formatRupiah = (amount: number) =>
  `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

const formatMonthLabel = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleDateString("id-ID", { year: "numeric", month: "long" });
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

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

const translateStatus = (status: string) => {
  const map: Record<string, string> = {
    unpaid: "Belum dibayar",
    waiting_confirmation: "Menunggu konfirmasi",
    paid: "Lunas",
    cancelled: "Dibatalkan",
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

const getInvoiceStatusClass = (status: InvoiceStatus) => `inv-badge inv-badge--${status}`;

function OrderDetailModal({
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
          ? mediaListFromResponse(orderRes.data)
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
          const imgs = tr.success ? mediaListFromResponse(tr.data) : [];
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

export default function PublicInvoice() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);

  const [siteName, setSiteName] = useState("Laundry");
  const [siteTagline, setSiteTagline] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [genRes, appRes] = await Promise.all([
          settingAPI.getByGroup("general"),
          settingAPI.getByGroup("appearance"),
        ]);
        if (cancelled) return;
        const general = genRes.success && genRes.data ? genRes.data : {};
        const appearance = appRes.success && appRes.data ? appRes.data : {};

        const name =
          typeof general.site_name === "string" && general.site_name.trim()
            ? general.site_name.trim()
            : "Laundry";
        setSiteName(name);

        const tag =
          typeof general.site_tagline === "string" && general.site_tagline.trim()
            ? general.site_tagline.trim()
            : null;
        setSiteTagline(tag);

        const rawLogo =
          (typeof appearance.brand_logo_square === "string" &&
            appearance.brand_logo_square) ||
          (typeof appearance.site_logo === "string" && appearance.site_logo) ||
          (typeof appearance.site_logo_dark === "string" &&
            appearance.site_logo_dark) ||
          "";
        setLogoUrl(resolveSettingImageUrl(rawLogo));

        // Update favicon and title dynamically
        const rawFavicon =
          (typeof appearance.site_favicon === "string" &&
            appearance.site_favicon) ||
          "";
        const favUrl = resolveSettingImageUrl(rawFavicon);
        if (favUrl) {
          let link: HTMLLinkElement | null = document.querySelector(
            "link[rel*='icon']"
          );
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = favUrl;
        }
        if (name) {
          document.title = `${name} - Tagihan Invoice`;
        }
      } catch {
        if (!cancelled) setLogoUrl(null);
      } finally {
        if (!cancelled) setBrandingLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) {
      setError("ID tagihan tidak valid");
      setLoading(false);
      return;
    }

    invoiceAPI
      .getInvoiceById(id)
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data as InvoiceData);
        } else {
          setError(res.message || "Gagal memuat invoice");
        }
      })
      .catch((err) => {
        setError(err.message || "Terjadi kesalahan jaringan");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const invoiceStatusLabel = useCallback((s: InvoiceStatus) => {
    const map: Record<InvoiceStatus, string> = {
      unpaid: "Belum dibayar",
      waiting_confirmation: "Menunggu konfirmasi",
      paid: "Lunas",
      cancelled: "Dibatalkan",
    };
    return map[s] || s;
  }, []);

  if (loading || !brandingLoaded) {
    return (
      <div className="pi-page pi-page--center">
        <div className="pi-spinner" aria-hidden />
        <p className="pi-loading-text">Memuat tagihan…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pi-page pi-page--center pi-page--padded">
        <div className="pi-error-card">
          <div className="pi-error-card__icon" aria-hidden>
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="pi-error-card__title">Tidak dapat menampilkan tagihan</h1>
          <p className="pi-error-card__msg">{error || "Data tidak ditemukan."}</p>
          <button
            type="button"
            className="pi-btn pi-btn--primary"
            onClick={() => window.location.reload()}
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }

  const orders = data.orders || [];

  return (
    <div className="pi-page">
      <header className="pi-header">
        <div className="pi-header__inner">
          <div className="pi-brand">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="pi-brand__logo"
                loading="eager"
              />
            ) : (
              <div className="pi-brand__placeholder" aria-hidden>
                {siteName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="pi-brand__text">
              <span className="pi-brand__name">{siteName}</span>
              {siteTagline && (
                <span className="pi-brand__tagline">{siteTagline}</span>
              )}
            </div>
          </div>
          <p className="pi-header__subtitle">Ringkasan tagihan laundry</p>
        </div>
      </header>

      <main className="pi-main">
        <section className="pi-hero-card">
          <div className="pi-hero-card__top">
            <div>
              <p className="pi-eyebrow">Nomor tagihan</p>
              <p className="pi-invoice-no">{data.invoice_number}</p>
              <p className="pi-period">
                Periode penagihan · {formatMonthLabel(data.billing_period)}
              </p>
            </div>
            <span className={getInvoiceStatusClass(data.status)}>
              {invoiceStatusLabel(data.status)}
            </span>
          </div>

          <div className="pi-total-block">
            <p className="pi-eyebrow">Total tagihan</p>
            <p className="pi-total-amount">{formatRupiah(data.total_amount)}</p>
            <p className="pi-total-hint">
              Sudah termasuk cuci di luar kuota dan layanan tambahan (jika ada).
            </p>
          </div>

          <div className="pi-student">
            <div className="pi-student__avatar" aria-hidden>
              {(data.student?.fullname || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="pi-student__name">
                {data.student?.fullname || "—"}
              </p>
              {data.student?.student_number && (
                <p className="pi-student__code">{data.student.student_number}</p>
              )}
            </div>
          </div>

          {data.status === "paid" && data.paid_at && (
            <div className="pi-paid-banner">
              <svg className="pi-paid-banner__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Pembayaran tercatat pada <strong>{formatDate(data.paid_at)}</strong>
              </span>
            </div>
          )}
        </section>

        <section className="pi-orders-section">
          <div className="pi-section-head">
            <h2 className="pi-section-title">Rincian pesanan</h2>
            <p className="pi-section-desc">
              Daftar cucian dalam periode ini. Ketuk &quot;Detail&quot; untuk foto
              penerimaan dan foto tiap update status.
            </p>
          </div>

          {orders.length === 0 ? (
            <div className="pi-empty">
              Belum ada pesanan pada periode tagihan ini.
            </div>
          ) : (
          <div className="pi-table-wrapper">
            <table className="pi-table">
              <thead>
                <tr>
                  <th className="pi-th">No.</th>
                  <th className="pi-th">Tanggal</th>
                  {/* <th className="pi-th">Nomor Pesanan</th> */}
                  <th className="pi-th">Total Item</th>
                  <th className="pi-th">Item Berbayar</th>
                  {/* <th className="pi-th">Status</th> */}
                  <th className="pi-th">Detail</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => (
                  <tr key={order.id} className="pi-tr">
                    <td className="pi-td pi-td--no">{idx + 1}</td>
                    <td className="pi-td pi-td--date">{formatDate(order.created_at)}</td>
                    {/* <td className="pi-td pi-td--order-no pi-strong">
                      {order.order_number}
                    </td> */}
                    <td className="pi-td pi-td--items">{order.total_items} item</td>
                    <td className="pi-td pi-td--paid-info">
                      {order.additional_fee + (order.total_addon_fee || 0) > 0 ? (
                        <span className="pi-amount pi-amount--danger">
                          {formatRupiah(order.additional_fee + (order.total_addon_fee || 0))}
                        </span>
                      ) : (
                        <span className="pi-muted">—</span>
                      )}
                    </td>
                    {/* <td className="pi-td pi-td--status">
                      <span
                        className={`status-pill ${getStatusPillClass(
                          order.current_status
                        )}`}
                      >
                        {translateStatus(order.current_status)}
                      </span>
                    </td> */}
                    <td className="pi-td pi-td--action">
                      <button
                        type="button"
                        className="pi-btn pi-btn--outline pi-btn--sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      </main>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          appName={siteName}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      <footer className="pi-footer">
        <p>
          {siteName} · dokumen ini dibuat secara otomatis ·{" "}
          {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
