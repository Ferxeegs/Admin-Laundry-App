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

  const state = (location.state || {}) as LocationState;

  const mode: Mode = useMemo(() => {
    return location.pathname.includes("/qr-codes/edit") ? "edit" : "create";
  }, [location.pathname]);

  const canGenerate = hasPermission("create_student");

  const [dormitories, setDormitories] = useState<DormitoryOption[]>([]);
  const [isLoadingDormitories, setIsLoadingDormitories] = useState(false);

  const [selectedDormitory, setSelectedDormitory] = useState<string>("");
  const [count, setCount] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setIsLoadingDormitories(true);
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
        setIsLoadingDormitories(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (mode === "edit" && state.dormitory) {
      setSelectedDormitory(state.dormitory);
    }
  }, [mode, state.dormitory]);

  const title =
    mode === "edit"
      ? "Tambah QR (append) per Asrama"
      : "Buat QR Tas (bulk)";

  const placeholder =
    mode === "edit"
      ? "Pilih asrama yang akan ditambah QR-nya"
      : "Pilih asrama untuk membuat QR";

  const handleSubmit = async () => {
    setError(null);

    if (!canGenerate) {
      setError("Anda tidak memiliki izin untuk membuat QR.");
      return;
    }

    const dorm = selectedDormitory.trim();
    if (!dorm) {
      setError("Dormitory/asrama wajib dipilih.");
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

      <div className="space-y-6">
        <ComponentCard title={title}>
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label>Asrama</Label>
              <select
                value={selectedDormitory}
                onChange={(e) => setSelectedDormitory(e.target.value)}
                disabled={isLoadingDormitories || isSubmitting}
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{placeholder}</option>
                {dormitories.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Jumlah QR</Label>
              <Input
                type="number"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                min="1"
                placeholder="Contoh: 25"
                disabled={isSubmitting}
              />
              <div className="mt-1 text-xs text-gray-500">
                Token QR dibuat otomatis. Nomor dan kode unik otomatis berurutan per asrama.
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-5 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => navigate("/qr-codes")}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || !canGenerate}
              className="px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Memproses..." : mode === "edit" ? "Tambah QR" : "Buat QR"}
            </button>
          </div>
        </ComponentCard>
      </div>
    </>
  );
}

