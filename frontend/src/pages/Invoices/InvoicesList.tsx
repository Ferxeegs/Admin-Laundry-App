import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";
import { ConfirmModal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { invoiceAPI, studentAPI } from "../../utils/api";
import { TrashBinIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";

type InvoiceStatus = "unpaid" | "waiting_confirmation" | "paid" | "cancelled";

type Order = {
  id: string;
  order_number: string;
  student_id: string;
  invoice_id: string | null;
  total_items: number;
  free_items_used: number;
  paid_items_count: number;
  additional_fee: number;
  current_status: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  student?: {
    id: string;
    fullname: string;
    unique_code: string | null;
  };
};

type Invoice = {
  id: string;
  invoice_number: string;
  student_id: string;
  billing_period: string; // date string
  total_amount: number;
  status: InvoiceStatus;
  paid_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  student?: {
    id: string;
    fullname: string;
    unique_code: string | null;
  };
};

type Student = {
  id: string;
  fullname: string;
};

function monthToBillingPeriod(monthValue: string) {
  // monthValue: YYYY-MM
  if (!monthValue) return "";
  return `${monthValue}-01`;
}

export default function InvoicesList() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  });

  const billingPeriod = useMemo(() => monthToBillingPeriod(selectedMonth), [selectedMonth]);

  const [eligibleOrders, setEligibleOrders] = useState<Order[]>([]);
  const [eligibleTotal, setEligibleTotal] = useState<number>(0);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  const { isOpen: isDeleteModalOpen, openModal: openDeleteModal, closeModal: closeDeleteModal } =
    useModal();
  const [selectedInvoiceForDelete, setSelectedInvoiceForDelete] = useState<{
    id: string;
    invoiceNumber: string;
  } | null>(null);

  const invoiceStatusLabel = (status: InvoiceStatus) => {
    switch (status) {
      case "unpaid":
        return "Belum Dibayar";
      case "waiting_confirmation":
        return "Menunggu Konfirmasi";
      case "paid":
        return "Lunas";
      case "cancelled":
        return "Dibatalkan";
      default:
        return status;
    }
  };

  const invoiceStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case "unpaid":
        return "warning";
      case "waiting_confirmation":
        return "info";
      case "paid":
        return "success";
      case "cancelled":
        return "error";
      default:
        return "info";
    }
  };

  const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatMonthLabel = (dateString: string) => {
    // dateString: YYYY-MM-01
    const d = new Date(dateString);
    return d.toLocaleDateString("id-ID", { year: "numeric", month: "long" });
  };

  const fetchAllStudents = async () => {
    setStudentsLoading(true);
    setStudentsError(null);

    try {
      const limit = 100;
      let page = 1;
      const all: Student[] = [];

      // Keep fetching until last page
      while (true) {
        const resp = await studentAPI.getAllStudents({
          page,
          limit,
        });

        if (!resp.success || !resp.data) {
          throw new Error(resp.message || "Gagal mengambil data siswa");
        }

        const batch = resp.data.students as Student[];
        all.push(...batch);

        const totalPages = resp.data.pagination?.totalPages ?? 1;
        if (page >= totalPages) break;
        page += 1;
      }

      setStudents(all);
    } catch (e: any) {
      setStudentsError(e?.message || "Terjadi kesalahan mengambil siswa");
    } finally {
      setStudentsLoading(false);
    }
  };

  const refreshEligibleOrders = async () => {
    if (!selectedStudentId || !billingPeriod) return;

    setEligibleLoading(true);
    setEligibleError(null);

    try {
      const resp = await invoiceAPI.getEligibleOrders({
        student_id: selectedStudentId,
        billing_period: billingPeriod,
      });

      if (resp.success && resp.data) {
        setEligibleOrders(resp.data.orders as Order[]);
        setEligibleTotal(resp.data.total_amount as number);
      } else {
        throw new Error(resp.message || "Gagal mengambil order eligible");
      }
    } catch (e: any) {
      setEligibleError(e?.message || "Terjadi kesalahan");
    } finally {
      setEligibleLoading(false);
    }
  };

  const refreshInvoices = async () => {
    if (!billingPeriod) return;

    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const resp = await invoiceAPI.getAllInvoices({
        page: 1,
        limit: 50,
        student_id: selectedStudentId || undefined,
        billing_period: billingPeriod,
      });

      if (resp.success && resp.data) {
        setInvoices(resp.data.invoices as Invoice[]);
      } else {
        throw new Error(resp.message || "Gagal mengambil data invoice");
      }
    } catch (e: any) {
      setInvoicesError(e?.message || "Terjadi kesalahan");
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStudents();
  }, []);

  useEffect(() => {
    // Initialize selected student
    if (!selectedStudentId && students.length > 0) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    refreshEligibleOrders();
    refreshInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, billingPeriod]);

  const canCreateInvoice = selectedStudentId && billingPeriod && eligibleOrders.length > 0;

  const handleCreateInvoice = async () => {
    if (!canCreateInvoice) return;

    setCreatingInvoice(true);

    try {
      const resp = await invoiceAPI.createInvoice({
        student_id: selectedStudentId,
        billing_period: billingPeriod,
      });

      if (resp.success && resp.data) {
        toastSuccess("Invoice berhasil dibuat!");
        await refreshEligibleOrders();
        await refreshInvoices();
      } else {
        throw new Error(resp.message || "Gagal membuat invoice");
      }
    } catch (e: any) {
      const msg = e?.message || "Gagal membuat invoice";
      setEligibleError(msg);
      toastError(msg);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, nextStatus: InvoiceStatus) => {
    if (!invoiceId) return;
    setUpdatingInvoiceId(invoiceId);

    try {
      const resp = await invoiceAPI.updateInvoice(invoiceId, {
        status: nextStatus,
      });

      if (resp.success) {
        toastSuccess("Status invoice berhasil diperbarui!");
        await refreshInvoices();
        await refreshEligibleOrders();
      } else {
        throw new Error(resp.message || "Gagal memperbarui status invoice");
      }
    } catch (e: any) {
      const msg = e?.message || "Gagal memperbarui";
      toastError(msg);
    } finally {
      setUpdatingInvoiceId(null);
    }
  };

  const handleDeleteInvoiceClick = (invoice: Invoice) => {
    setSelectedInvoiceForDelete({ id: invoice.id, invoiceNumber: invoice.invoice_number });
    openDeleteModal();
  };

  const handleDeleteInvoice = async () => {
    if (!selectedInvoiceForDelete) return;

    const invoiceId = selectedInvoiceForDelete.id;
    setDeletingInvoiceId(invoiceId);
    setInvoicesError(null);
    closeDeleteModal();

    try {
      const resp = await invoiceAPI.deleteInvoice(invoiceId);
      if (resp.success) {
        toastSuccess("Invoice berhasil dihapus!");
        await refreshEligibleOrders();
        await refreshInvoices();
      } else {
        throw new Error(resp.message || "Gagal menghapus invoice");
      }
    } catch (e: any) {
      const msg = e?.message || "Gagal menghapus invoice";
      setInvoicesError(msg);
      toastError(msg);
    } finally {
      setDeletingInvoiceId(null);
      setSelectedInvoiceForDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Siswa
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            disabled={studentsLoading}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullname}
              </option>
            ))}
          </select>
          {studentsError && (
            <p className="text-sm text-red-600 dark:text-red-400">{studentsError}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            {billingPeriod ? formatMonthLabel(billingPeriod) : "-"}
          </div>
        </div>

        <div className="flex flex-col justify-end gap-3">
          <div className="flex items-center gap-3">
            <Badge size="sm" color={eligibleOrders.length > 0 ? "success" : "light"}>
              {eligibleOrders.length} Order eligible
            </Badge>
            <Badge size="sm" color="primary">
              Total: {formatRupiah(eligibleTotal)}
            </Badge>
          </div>
          <button
            type="button"
            onClick={handleCreateInvoice}
            disabled={!canCreateInvoice || creatingInvoice}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creatingInvoice ? "Membuat..." : "Buat Invoice"}
          </button>
        </div>
      </div>

      {/* Eligible Orders */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Order Eligible
          </h3>
        </div>

        {eligibleError && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            {eligibleError}
          </div>
        )}

        {eligibleLoading && eligibleOrders.length === 0 ? (
          <TableSkeleton rows={7} columns={6} />
        ) : eligibleOrders.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
            Tidak ada order eligible untuk siswa & bulan ini.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Nomor Order
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Tanggal Order
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Total Item
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Tambahan Biaya
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Status Order
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {eligibleOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-800">
                        {order.order_number}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                        {formatDateTime(order.created_at)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                        {order.total_items} (Free {order.free_items_used}, Paid {order.paid_items_count})
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                        {formatRupiah(order.additional_fee)}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Badge size="sm" color="light">
                          {order.current_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Daftar Invoice
          </h3>
        </div>

        {invoicesError && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            {invoicesError}
          </div>
        )}

        {invoicesLoading && invoices.length === 0 ? (
          <TableSkeleton rows={7} columns={7} />
        ) : invoices.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
            Belum ada invoice untuk siswa & bulan ini.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Nomor Invoice
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Total
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Dibayar Pada
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Update Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                      Aksi
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-800 font-medium">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Badge size="sm" color={invoiceStatusColor(inv.status)}>
                          {invoiceStatusLabel(inv.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                        {formatRupiah(inv.total_amount)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                        {formatDateTime(inv.paid_at)}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <select
                          value={inv.status}
                          onChange={(e) =>
                            handleUpdateInvoiceStatus(inv.id, e.target.value as InvoiceStatus)
                          }
                          disabled={updatingInvoiceId === inv.id}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                        >
                          <option value="unpaid">Belum Dibayar</option>
                          <option value="waiting_confirmation">Menunggu Konfirmasi</option>
                          <option value="paid">Lunas</option>
                          <option value="cancelled">Dibatalkan</option>
                        </select>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoiceClick(inv)}
                          disabled={deletingInvoiceId === inv.id}
                          className="inline-flex items-center justify-center w-8 h-8 text-red-500 transition-colors rounded-lg hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Hapus invoice"
                        >
                          <TrashBinIcon className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteInvoice}
        title="Hapus Invoice"
        message={
          <>
            Apakah Anda yakin ingin menghapus invoice{" "}
            <strong className="text-gray-800 dark:text-white">{selectedInvoiceForDelete?.invoiceNumber}</strong>?
          </>
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={deletingInvoiceId === selectedInvoiceForDelete?.id}
        showWarning={true}
        warningMessage="Orders terkait akan dilepaskan (invoice_id di-set null) sehingga bisa dibuat invoice ulang."
      />
    </div>
  );
}

