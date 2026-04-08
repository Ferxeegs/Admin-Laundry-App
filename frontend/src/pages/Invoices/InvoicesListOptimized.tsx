import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import { invoiceAPI } from "../../utils/api";
import { TrashBinIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

type InvoiceStatus = "unpaid" | "waiting_confirmation" | "paid" | "cancelled";

type Invoice = {
  id: string;
  invoice_number: string;
  student_id: string;
  billing_period: string;
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

function monthToBillingPeriod(monthValue: string) {
  if (!monthValue) return "";
  // YYYY-MM-01
  return `${monthValue}-01`;
}

export default function InvoicesListOptimized() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const hasCreateInvoicePermission = hasPermission("create_invoice");
  const { success: toastSuccess, error: toastError } = useToast();
  const { isOpen, openModal, closeModal } = useModal();

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  });

  const billingPeriod = useMemo(
    () => monthToBillingPeriod(selectedMonth),
    [selectedMonth]
  );

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(
    null
  );
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
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

  const formatRupiah = (amount: number) =>
    `Rp ${amount.toLocaleString("id-ID")}`;

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const totalAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0),
    [invoices]
  );

  const fetchInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const resp = await invoiceAPI.getAllInvoices({
        page,
        limit: pagination.limit,
        billing_period: billingPeriod,
      });

      if (resp.success && resp.data) {
        setInvoices(resp.data.invoices as Invoice[]);
        if (resp.data.pagination) setPagination(resp.data.pagination);
      } else {
        throw new Error(resp.message || "Gagal mengambil data invoice");
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Terjadi kesalahan";
      setInvoicesError(msg);
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [billingPeriod]);

  useEffect(() => {
    fetchInvoices();
  }, [billingPeriod, page]);

  const handleUpdateInvoiceStatus = async (
    invoiceId: string,
    nextStatus: InvoiceStatus
  ) => {
    if (!invoiceId) return;
    setUpdatingInvoiceId(invoiceId);

    try {
      const resp = await invoiceAPI.updateInvoice(invoiceId, { status: nextStatus });
      if (resp.success) {
        toastSuccess("Status invoice berhasil diperbarui!");
        await fetchInvoices();
      } else {
        throw new Error(resp.message || "Gagal memperbarui status invoice");
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Gagal memperbarui status invoice";
      toastError(msg);
    } finally {
      setUpdatingInvoiceId(null);
    }
  };

  const handleDeleteInvoiceClick = (invoice: Invoice) => {
    setSelectedInvoiceForDelete({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
    });
    openModal();
  };

  const handleDeleteInvoice = async () => {
    if (!selectedInvoiceForDelete) return;

    const invoiceId = selectedInvoiceForDelete.id;
    setDeletingInvoiceId(invoiceId);
    setInvoicesError(null);
    closeModal();

    try {
      const resp = await invoiceAPI.deleteInvoice(invoiceId);
      if (resp.success) {
        toastSuccess("Invoice berhasil dihapus!");
        await fetchInvoices();
      } else {
        throw new Error(resp.message || "Gagal menghapus invoice");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menghapus invoice";
      setInvoicesError(msg);
      toastError(msg);
    } finally {
      setDeletingInvoiceId(null);
      setSelectedInvoiceForDelete(null);
    }
  };

  const handleCopyLink = (invoiceId: string) => {
    const url = `${window.location.origin}/public/invoice/${invoiceId}`;
    navigator.clipboard.writeText(url)
      .then(() => toastSuccess("Link publik disalin ke clipboard!"))
      .catch(() => toastError("Gagal menyalin link"));
  };

  return (
    <div className="space-y-6">
      {/* Header Actions & Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 bg-gray-50/50 dark:bg-white/[0.02] p-4 rounded-2xl border border-gray-100 dark:border-white/[0.05]">
        <div className="space-y-1.5 w-full md:w-64 shrink-0">
          <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
            Bulan Tagihan
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Badge size="md" color="light">
              <span className="font-bold">{invoices.length}</span> Invoice
            </Badge>
            <Badge size="md" color="success">
              Total <span className="font-bold">{formatRupiah(totalAmount)}</span>
            </Badge>
          </div>

          {hasCreateInvoicePermission && (
            <button
              type="button"
              onClick={() => navigate("/invoices/create")}
              className="inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-brand-500 rounded-xl hover:bg-brand-600 shadow-lg shadow-brand-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Buat Invoice
            </button>
          )}
        </div>
      </div>

      {invoicesError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {invoicesError}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        {invoicesLoading && invoices.length === 0 ? (
          <div className="p-4">
            <TableSkeleton rows={7} columns={6} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
            Belum ada invoice untuk bulan ini.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                    Nomor Invoice
                  </TableCell>
                  <TableCell isHeader className="px-5 py-3 text-theme-xs text-gray-500">
                    Siswa
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
                    Aksi
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <TableCell className="px-5 py-4 text-theme-sm text-gray-800 font-medium">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-theme-sm text-gray-500">
                      {inv.student?.fullname || "-"}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={inv.status}
                          onChange={(e) =>
                            handleUpdateInvoiceStatus(
                              inv.id,
                              e.target.value as InvoiceStatus
                            )
                          }
                          disabled={updatingInvoiceId === inv.id}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                        >
                          <option value="unpaid">Belum Dibayar</option>
                          <option value="waiting_confirmation">
                            Menunggu Konfirmasi
                          </option>
                          <option value="paid">Lunas</option>
                          <option value="cancelled">Dibatalkan</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv.id)}
                          className="inline-flex items-center justify-center w-8 h-8 text-blue-500 transition-colors rounded-lg hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-200"
                          title="Copy Link Publik"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteInvoiceClick(inv)}
                          disabled={deletingInvoiceId === inv.id}
                          className="inline-flex items-center justify-center w-8 h-8 text-red-500 transition-colors rounded-lg hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Hapus invoice"
                        >
                          <TrashBinIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {invoicesLoading && invoices.length === 0 ? (
          <div className="p-2">
            <TableSkeleton rows={5} columns={2} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
            Belum ada invoice untuk bulan ini.
          </div>
        ) : (
          invoices.map((inv) => (
            <div
              key={inv.id}
              className="p-4 rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                    {inv.invoice_number}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {inv.student?.fullname || "-"}
                  </p>
                </div>
                <Badge size="sm" color={invoiceStatusColor(inv.status)}>
                  {invoiceStatusLabel(inv.status)}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Total
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {formatRupiah(inv.total_amount)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Dibayar Pada
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {formatDateTime(inv.paid_at)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <select
                  value={inv.status}
                  onChange={(e) =>
                    handleUpdateInvoiceStatus(
                      inv.id,
                      e.target.value as InvoiceStatus
                    )
                  }
                  disabled={updatingInvoiceId === inv.id}
                  className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="unpaid">Belum Dibayar</option>
                  <option value="waiting_confirmation">
                    Menunggu Konfirmasi
                  </option>
                  <option value="paid">Lunas</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>

                <button
                  type="button"
                  onClick={() => handleCopyLink(inv.id)}
                  className="inline-flex items-center justify-center w-9 h-9 text-blue-500 transition-colors rounded-lg hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-200"
                  title="Copy Link Publik"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteInvoiceClick(inv)}
                  disabled={deletingInvoiceId === inv.id}
                  className="inline-flex items-center justify-center w-9 h-9 text-red-500 transition-colors rounded-lg hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Hapus invoice"
                >
                  <TrashBinIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 dark:border-white/[0.05]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
              Menampilkan{" "}
              {(page - 1) * pagination.limit + 1} -{" "}
              {Math.min(page * pagination.limit, pagination.total)} dari{" "}
              {pagination.total}
            </div>
            <div className="flex gap-2 justify-center sm:justify-end">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
              >
                Sebelumnya
              </button>
              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(pagination.totalPages, p + 1)
                  )
                }
                disabled={page === pagination.totalPages}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleDeleteInvoice}
        title="Hapus Invoice"
        message={
          <>
            Apakah Anda yakin ingin menghapus invoice{" "}
            <strong className="text-gray-800 dark:text-white">
              {selectedInvoiceForDelete?.invoiceNumber}
            </strong>
            ?
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

