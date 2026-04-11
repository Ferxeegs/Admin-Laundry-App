import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router";
import { paymentAPI, settingAPI, getMediaUrl } from "../../utils/api";
import "../Public/PublicInvoice.css";

function resolveSettingImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  const u = raw.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return getMediaUrl(u);
}

const formatRupiah = (amount: number) =>
  `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

type PaymentStatusType = "PENDING" | "PAID" | "EXPIRED" | "FAILED";

interface PaymentData {
  id: string;
  invoice_id: string;
  external_id: string;
  amount: number;
  status: PaymentStatusType;
  payment_method: string | null;
  payment_channel: string | null;
  paid_at: string | null;
  created_at: string | null;
}

export default function PaymentResult() {
  const { id: invoiceId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");

  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [siteName, setSiteName] = useState("Laundry");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Load branding
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

        const rawLogo =
          (typeof appearance.brand_logo_square === "string" &&
            appearance.brand_logo_square) ||
          (typeof appearance.site_logo === "string" && appearance.site_logo) ||
          "";
        setLogoUrl(resolveSettingImageUrl(rawLogo));

        if (name) {
          document.title = `${name} - Hasil Pembayaran`;
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBrandingLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPayment = useCallback(async () => {
    if (!invoiceId) return;
    try {
      const res = await paymentAPI.getPaymentStatus(invoiceId);
      if (res.success && res.data) {
        setPayment(res.data as PaymentData);
        // Stop polling if we got a final status
        if (
          res.data.status === "PAID" ||
          res.data.status === "EXPIRED" ||
          res.data.status === "FAILED"
        ) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } else {
        setError(res.message || "Gagal memuat status pembayaran");
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchPayment();

    // Poll every 5 seconds for up to 2 minutes if status is pending
    pollRef.current = setInterval(() => {
      fetchPayment();
    }, 5000);

    const timeout = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 120000); // stop polling after 2 minutes

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [fetchPayment]);

  const getStatusConfig = () => {
    const s = payment?.status;

    if (s === "PAID" || urlStatus === "success") {
      return {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ),
        iconClass: "pi-result-icon--success",
        title: "Pembayaran Berhasil!",
        message: "Terima kasih, pembayaran Anda telah diterima dan dicatat.",
      };
    }

    if (s === "EXPIRED") {
      return {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
        iconClass: "pi-result-icon--failed",
        title: "Pembayaran Kedaluwarsa",
        message: "Link pembayaran sudah tidak valid. Silakan buat pembayaran baru melalui halaman invoice.",
      };
    }

    if (s === "FAILED" || urlStatus === "failed") {
      return {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ),
        iconClass: "pi-result-icon--failed",
        title: "Pembayaran Gagal",
        message: "Maaf, pembayaran tidak berhasil diproses. Silakan coba lagi.",
      };
    }

    // PENDING
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      iconClass: "pi-result-icon--pending",
      title: "Menunggu Konfirmasi",
      message: "Pembayaran sedang diproses. Halaman ini akan otomatis terupdate saat status pembayaran berubah.",
    };
  };

  if (loading || !brandingLoaded) {
    return (
      <div className="pi-page pi-page--center">
        <div className="pi-spinner" aria-hidden />
        <p className="pi-loading-text">Memeriksa status pembayaran…</p>
      </div>
    );
  }

  if (error && !payment) {
    return (
      <div className="pi-page pi-page--center pi-page--padded">
        <div className="pi-error-card">
          <div className="pi-error-card__icon" aria-hidden>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="pi-error-card__title">Gagal memuat status</h1>
          <p className="pi-error-card__msg">{error}</p>
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

  const config = getStatusConfig();

  return (
    <div className="pi-page">
      <header className="pi-header">
        <div className="pi-header__inner">
          <div className="pi-brand">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="pi-brand__logo" loading="eager" />
            ) : (
              <div className="pi-brand__placeholder" aria-hidden>
                {siteName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="pi-brand__text">
              <span className="pi-brand__name">{siteName}</span>
            </div>
          </div>
          <p className="pi-header__subtitle">Status pembayaran</p>
        </div>
      </header>

      <main className="pi-main">
        <div className="pi-result-card">
          <div className={`pi-result-icon ${config.iconClass}`}>
            {config.icon}
          </div>

          <h1 className="pi-result-card__title">{config.title}</h1>
          <p className="pi-result-card__msg">{config.message}</p>

          {payment && (
            <div className="pi-result-detail">
              <div className="pi-result-detail__row">
                <span className="pi-result-detail__label">Jumlah</span>
                <span className="pi-result-detail__value">
                  {formatRupiah(payment.amount)}
                </span>
              </div>
              {payment.payment_method && (
                <div className="pi-result-detail__row">
                  <span className="pi-result-detail__label">Metode</span>
                  <span className="pi-result-detail__value">
                    {payment.payment_method}
                    {payment.payment_channel
                      ? ` · ${payment.payment_channel}`
                      : ""}
                  </span>
                </div>
              )}
              {payment.paid_at && (
                <div className="pi-result-detail__row">
                  <span className="pi-result-detail__label">Waktu bayar</span>
                  <span className="pi-result-detail__value">
                    {new Date(payment.paid_at).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="pi-result-actions">
            <Link
              to={`/public/invoice/${invoiceId}`}
              className="pi-btn pi-btn--primary"
              style={{ textDecoration: "none" }}
            >
              Lihat Invoice
            </Link>
          </div>
        </div>
      </main>

      <footer className="pi-footer">
        <p>
          {siteName} · dokumen ini dibuat secara otomatis ·{" "}
          {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
