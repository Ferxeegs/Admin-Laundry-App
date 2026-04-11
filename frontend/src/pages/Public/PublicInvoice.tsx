import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  invoiceAPI,
  paymentAPI,
  getMediaUrl,
  settingAPI,
} from "../../utils/api";
import OrderDetailModal from "../../components/Orders/OrderDetailModal";
import "./PublicInvoice.css";

type InvoiceStatus = "unpaid" | "paid" | "failed" | "cancelled";

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

// mediaListFromResponse removed - unused after refactor

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

// formatDateTime removed - unused after refactor

// translateStatus removed - unused after refactor

// getStatusPillClass removed - unused after refactor

const getInvoiceStatusClass = (status: InvoiceStatus) => `inv-badge inv-badge--${status}`;

// OrderDetailModal refactored to shared component

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

  // Payment state
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handlePayNow = useCallback(async () => {
    if (!data) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await paymentAPI.createPayment(data.id);
      if (res.success && res.data?.xendit_invoice_url) {
        // Redirect to Xendit checkout page
        window.location.href = res.data.xendit_invoice_url;
      } else {
        setPaymentError(res.message || "Gagal membuat link pembayaran");
      }
    } catch (err: any) {
      setPaymentError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setPaymentLoading(false);
    }
  }, [data]);

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
      paid: "Lunas",
      failed: "Gagal",
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

            {/* Payment Button — show for unpaid or failed invoices */}
            {(data.status === "unpaid" || data.status === "failed") && data.total_amount > 0 && (
              <div className="pi-pay-section">
                {paymentError && (
                  <div className="pi-pay-error">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="pi-pay-error__icon">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{paymentError}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="pi-btn-pay"
                  onClick={handlePayNow}
                  disabled={paymentLoading}
                  id="btn-pay-now"
                >
                  {paymentLoading ? (
                    <>
                      <span className="pi-btn-pay__spinner" aria-hidden />
                      <span>Memproses…</span>
                    </>
                  ) : (
                    <>
                      <svg className="pi-btn-pay__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                      <span>Bayar Sekarang</span>
                      <svg className="pi-btn-pay__arrow" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </button>
                <p className="pi-pay-hint">
                  Pembayaran aman via Xendit · Transfer bank, e-wallet, QRIS, dll.
                </p>
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
