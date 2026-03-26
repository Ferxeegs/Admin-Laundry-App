import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import TableSkeleton from "../../components/common/TableSkeleton";
import { invoiceAPI, studentAPI } from "../../utils/api";
import { useToast } from "../../context/ToastContext";

type Student = {
  id: string;
  fullname: string;
};

function monthToBillingPeriod(monthValue: string) {
  if (!monthValue) return "";
  return `${monthValue}-01`;
}

export default function CreateInvoice() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  });
  const billingPeriod = useMemo(
    () => monthToBillingPeriod(selectedMonth),
    [selectedMonth]
  );

  const [studentSearch, setStudentSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const canSubmit = Boolean(selectedStudentId && billingPeriod);

  const fetchStudents = async (search: string) => {
    setStudentsLoading(true);
    setStudentsError(null);

    try {
      // Keep it light: only fetch first page and small limit
      const resp = await studentAPI.getAllStudents({
        page: 1,
        limit: 10,
        search: search.trim() || undefined,
        // Prefer showing active students first
        is_active: true,
      });

      if (resp.success && resp.data) {
        setStudents(resp.data.students as Student[]);
      } else {
        throw new Error(resp.message || "Gagal mengambil data siswa");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
      setStudentsError(msg);
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    // Debounce search
    const t = setTimeout(() => {
      fetchStudents(studentSearch);
    }, 350);

    return () => clearTimeout(t);
  }, [studentSearch]);

  const handlePickStudent = (id: string) => {
    setSelectedStudentId(id);
  };

  const [creating, setCreating] = useState(false);
  const handleCreateInvoice = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const resp = await invoiceAPI.createInvoice({
        student_id: selectedStudentId,
        billing_period: billingPeriod,
      });

      if (resp.success && resp.data) {
        toastSuccess("Invoice berhasil dibuat!");
        navigate("/invoices");
      } else {
        throw new Error(resp.message || "Gagal membuat invoice");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal membuat invoice";
      toastError(msg);
    } finally {
      setCreating(false);
    }
  };

  const formatMonthLabel = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString("id-ID", { year: "numeric", month: "long" });
  };

  return (
    <div className="space-y-6">
      <PageMeta
        title="Buat Invoice"
        description="Membuat invoice tagihan bulanan"
      />
      <PageBreadcrumb pageTitle="Buat Invoice" />

      <ComponentCard title="Pembuatan Invoice" desc="Pilih siswa dan periode bulan yang akan di-invoice">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Siswa
            </label>
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Cari nama siswa..."
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />

            {studentsError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {studentsError}
              </p>
            )}

            <div className="mt-2 rounded-xl border border-gray-200 dark:border-white/[0.05] overflow-hidden">
              {studentsLoading && students.length === 0 ? (
                <TableSkeleton rows={6} columns={2} />
              ) : students.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Tidak ada siswa yang cocok.
                </div>
              ) : (
                <ul className="max-h-[260px] overflow-auto divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {students.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handlePickStudent(s.id)}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.02] ${
                          selectedStudentId === s.id
                            ? "bg-brand-50 dark:bg-brand-900/20"
                            : "bg-white dark:bg-transparent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-800 dark:text-white/90">
                            {s.fullname}
                          </span>
                          {selectedStudentId === s.id && (
                            <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                              Dipilih
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Bulan Tagihan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
              {billingPeriod ? formatMonthLabel(billingPeriod) : "-"}
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.05] p-4 bg-white dark:bg-white/[0.03]">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ringkasan
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedStudentId
                    ? `Siswa: ${students.find((s) => s.id === selectedStudentId)?.fullname || selectedStudentId}`
                    : "Siswa belum dipilih"}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {billingPeriod
                    ? `Periode: ${formatMonthLabel(billingPeriod)}`
                    : "Periode belum dipilih"}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={!canSubmit || creating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Membuat..." : "Buat Invoice"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/invoices")}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-300 dark:bg-gray-900/40 dark:border-gray-800"
              >
                Kembali
              </button>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}

