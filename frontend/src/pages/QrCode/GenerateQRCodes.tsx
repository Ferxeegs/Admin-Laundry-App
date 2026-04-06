import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useToast } from "../../context/ToastContext";
import { dormitoryAPI, qrCodeAPI } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

interface DormitoryOption {
  id: string;
  name: string;
}

type Mode = "create" | "edit";

interface LocationState {
  dormitory?: string | null;
}

export default function GenerateQRCodes() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const [loadingDorms, setLoadingDorms] = useState(true);

  const state = (location.state || {}) as LocationState;

  const mode: Mode = useMemo(() => {
    return location.pathname.includes("/qr-codes/edit") ? "edit" : "create";
  }, [location.pathname]);

  const canGenerate = hasPermission("create_student");

  const [dormitories, setDormitories] = useState<DormitoryOption[]>([]);
  const [selectedDormitory, setSelectedDormitory] = useState<string>("");
  const [count, setCount] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoadingDorms(true);
      setError(null);
      try {
        const res = await dormitoryAPI.getAllDormitories({ page: 1, limit: 100 });
        if (res.success && res.data) {
          setDormitories(res.data.dormitories as DormitoryOption[]);
        } else {
          setDormitories([]);
        }
      } catch (e: any) {
        setError(e?.message || "Gagal memuat data dormitory");
        setDormitories([]);
      } finally {
        setLoadingDorms(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (mode === "edit" && state.dormitory) {
      setSelectedDormitory(state.dormitory);
    }
  }, [mode, state.dormitory]);

  const title = mode === "edit" ? "Tambah QR (append)" : "Buat QR Tas (bulk)";
  const description = mode === "edit" ? "Menambah jumlah QR pada asrama yang sudah ada" : "Membuat set QR baru untuk asrama baru";

  const handleSubmit = async () => {
    setError(null);

    if (!canGenerate) {
      setError("Anda tidak memiliki izin untuk membuat QR.");
      return;
    }

    const dorm = selectedDormitory.trim();
    if (!dorm) {
      setError("Silakan pilih asrama terlebih dahulu.");
      return;
    }

    const c = Number(count);
    if (!Number.isFinite(c) || c < 1) {
      setError("Jumlah QR harus minimal 1.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await qrCodeAPI.bulkGenerateQRs({ dormitory: dorm, count: c });
      if (!res.success) {
        setError(res.message || res.error || "Gagal membuat QR.");
        showError(res.message || res.error || "Gagal membuat QR.");
        return;
      }

      const data = res.data as any;
      success(
        `QR berhasil ditambah untuk ${data?.dormitory ?? dorm} (${data?.start_qr_number ?? "?"} - ${
          data?.end_qr_number ?? "?"
        }).`,
      );
      navigate("/qr-codes");
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan.");
      showError(e?.message || "Terjadi kesalahan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta title="QR Tas" description="Buat/tambah QR tas untuk proses laundry" />
      <PageBreadcrumb pageTitle="QR Tas" />

      <div className="mx-auto max-w-2xl space-y-6">
        <ComponentCard title={title}>
          <p className="mb-6 -mt-2 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>

          {error && (
            <div className="mb-6 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="space-y-8">
            {/* Dormitory Selection Grid */}
            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-700 dark:text-gray-300">Pilih Asrama</Label>
              {loadingDorms ? (
                <div className="flex flex-wrap gap-2 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 w-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dormitories.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDormitory(d.name)}
                      className={`px-4 py-2 text-sm font-bold rounded-xl border transition-all active:scale-95 ${
                        selectedDormitory === d.name
                          ? "bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/20"
                          : "bg-white border-gray-100 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:bg-gray-900/50 dark:border-white/5 dark:text-gray-400"
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                  {dormitories.length === 0 && !loadingDorms && (
                    <p className="text-sm text-gray-500 italic">Tidak ada data asrama.</p>
                  )}
                </div>
              )}
            </div>

            {/* Count Input */}
            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-700 dark:text-gray-300">Jumlah QR yang Ingin Dibuat</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  min="1"
                  placeholder="Contoh: 25"
                  disabled={isSubmitting}
                  className="rounded-2xl pl-11 h-12 text-lg font-bold"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-100 dark:border-white/5 flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Token QR akan dibuat secara aman oleh sistem. Nomor dan kode unik akan otomatis berurutan berdasarkan data asrama yang dipilih.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-6 border-t border-gray-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => navigate("/qr-codes")}
              disabled={isSubmitting}
              className="px-6 py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 dark:bg-gray-900 dark:border-white/10 dark:text-gray-400 transition-all active:scale-95 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || !canGenerate}
              className="px-8 py-3 text-sm font-bold text-white bg-brand-500 rounded-2xl hover:bg-brand-600 shadow-xl shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Memproses...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {mode === "edit" ? "Tambah Unit QR" : "Generate unit QR"}
                </>
              )}
            </button>
          </div>
        </ComponentCard>
      </div>
    </>
  );
}

