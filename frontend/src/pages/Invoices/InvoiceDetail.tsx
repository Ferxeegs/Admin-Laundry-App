import { useEffect, useState, useCallback, type ComponentPropsWithoutRef } from "react";
import { useParams, Link } from "react-router";
import { invoiceAPI, settingAPI } from "../../utils/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import OrderDetailModal, { OrderData } from "../../components/Orders/OrderDetailModal";

// Modal styles (OrderDetailModal)
import "../Public/PublicInvoice.css";
import "./InvoiceDetail.css";
import { twMerge } from "tailwind-merge";

/** Padding konsisten sel tabel rincian pesanan (desktop) */
const orderCellBase =
  "px-3 py-3.5 first:pl-4 last:pr-4 lg:px-4 lg:py-3.5 lg:first:pl-6 lg:last:pr-6";

type InvoiceStatus = "unpaid" | "paid" | "failed" | "cancelled";

interface InvoiceDetailType {
  id: string;
  invoice_number: string;
  student_id: string;
  billing_period: string;
  total_amount: number;
  status: InvoiceStatus;
  paid_at: string | null;
  created_at: string | null;
  student?: {
    id: string;
    fullname: string;
    student_number?: string | null;
    unique_code: string | null;
  };
  orders: OrderData[];
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { success: toastSuccess, error: toastError } = useToast();

  const [invoice, setInvoice] = useState<InvoiceDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
  const [siteName, setSiteName] = useState("Laundry");

  const fetchInvoice = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const resp = await invoiceAPI.getInvoiceById(id);
      if (resp.success && resp.data) {
        setInvoice(resp.data as unknown as InvoiceDetailType);
      } else {
        throw new Error(resp.message || "Gagal memuat detail invoice");
      }
    } catch (err: any) {
      setError(err.message || "Gagal memuat detail invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
    
    // Fetch site name for modal branding
    settingAPI.getByGroup("general").then(res => {
        if (res.success && res.data?.site_name) {
            setSiteName(res.data.site_name);
        }
    });
  }, [fetchInvoice]);

  const handleUpdateStatus = async (nextStatus: InvoiceStatus) => {
    if (!id || !invoice) return;
    try {
      setUpdating(true);
      const resp = await invoiceAPI.updateInvoice(id, { status: nextStatus });
      if (resp.success) {
        toastSuccess("Status invoice berhasil diperbarui!");
        await fetchInvoice();
      } else {
        throw new Error(resp.message || "Gagal memperbarui status");
      }
    } catch (err: any) {
      toastError(err.message || "Gagal memperbarui status");
    } finally {
      setUpdating(false);
    }
  };

  const invoiceStatusLabel = (status: InvoiceStatus) => {
    switch (status) {
      case "unpaid": return "Belum Dibayar";
      case "paid": return "Lunas";
      case "failed": return "Gagal";
      case "cancelled": return "Dibatalkan";
      default: return status;
    }
  };

  const invoiceStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case "unpaid": return "warning";
      case "paid": return "success";
      case "failed": return "error";
      case "cancelled": return "light";
      default: return "info";
    }
  };

  const formatRupiah = (amount: number) => 
    `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

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
    return d.toLocaleDateString("id-ID", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center space-y-4 px-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-full">
            <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">{error || "Invoice tidak ditemukan"}</p>
        <Link to="/invoices" className="px-6 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/20">
          Kembali ke Daftar
        </Link>
      </div>
    );
  }

  return (
    <div className="invoice-detail-page space-y-6 sm:space-y-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pb-10">
      {/* Header with Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
            <Link
              to="/invoices"
              className="invoice-detail-print-hide mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              aria-label="Kembali ke daftar invoice"
            >
                <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-2xl">Detail Invoice</h1>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Kelola dan tinjau rincian tagihan siswa</p>
            </div>
        </div>
        <button
            type="button"
            onClick={() => window.print()}
            className="invoice-detail-print-hide flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:h-auto sm:w-auto sm:py-2.5"
        >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Cetak
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Left Column: Invoice & Student Info */}
        <div className="space-y-6 lg:col-span-2 sm:space-y-8">
          
          {/* Main Hero Card */}
          <div className="invoice-detail-print overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-200/40 dark:border-gray-700 dark:bg-gray-800 dark:shadow-none sm:rounded-3xl">
            <div className="space-y-6 p-5 sm:space-y-8 sm:p-6 lg:p-8">
                <div className="flex flex-col gap-6 border-b border-gray-100 pb-6 dark:border-gray-700/80 md:flex-row md:items-start md:justify-between md:gap-8 md:border-0 md:pb-0">
                    <div className="min-w-0 space-y-3 sm:space-y-4">
                        <div className="space-y-1">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Nomor Invoice</p>
                            <h2 className="break-words text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">{invoice.invoice_number}</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge color={invoiceStatusColor(invoice.status)}>
                                {invoiceStatusLabel(invoice.status)}
                            </Badge>
                            <span className="hidden text-gray-300 sm:inline dark:text-gray-600" aria-hidden>•</span>
                            <span className="inline-flex rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700/50 dark:text-gray-300 sm:text-sm">
                                {new Date(invoice.billing_period).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                            </span>
                        </div>
                    </div>
                    
                    <div className="min-w-0 border-t border-gray-100 pt-4 dark:border-gray-700 md:border-0 md:pt-0 md:text-right">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Tagihan</p>
                        <p className="mt-1 text-3xl font-black tracking-tight text-brand-600 dark:text-brand-400 sm:text-4xl">
                            {formatRupiah(invoice.total_amount)}
                        </p>
                    </div>
                </div>

                <div className="hidden h-px w-full bg-gray-100 dark:bg-gray-700 md:block" />

                <div className="flex gap-4 sm:items-center sm:gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-xl font-black text-white shadow-lg shadow-brand-500/25 sm:h-16 sm:w-16 sm:text-2xl">
                        {(invoice.student?.fullname || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Siswa Penerima</p>
                        <h3 className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">{invoice.student?.fullname || "—"}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-block max-w-full truncate rounded border border-gray-100 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 sm:text-sm">
                                {invoice.student?.student_number || invoice.student?.unique_code || "—"}
                            </span>
                            {invoice.student?.unique_code && invoice.student?.student_number && (
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                                    {invoice.student.unique_code}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
          </div>

          {/* Orders: cards on mobile, table on lg+ */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-3xl">
            <div className="flex flex-col gap-1 border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white sm:text-lg">
                    <svg className="h-5 w-5 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Rincian Pesanan
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {invoice.orders.length}
                    </span>
                </h3>
            </div>

            {/* Mobile & tablet: stacked cards */}
            <div className="space-y-3 p-4 lg:hidden">
              {invoice.orders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500 dark:border-gray-600">
                  Tidak ada data pesanan.
                </p>
              ) : (
                invoice.orders.map((order, idx) => {
                  const totalOrder = Number(order.additional_fee) + Number(order.total_addon_fee || 0);
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-500">#{idx + 1}</p>
                          <p className="font-bold text-gray-900 dark:text-white">{order.order_number}</p>
                          <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-brand-600 dark:hover:bg-gray-800"
                          title="Lihat detail pesanan"
                          aria-label="Lihat detail pesanan"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          {order.total_items} item
                        </span>
                        <span className="rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                          FREE {order.free_items_used}
                        </span>
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/20 dark:text-red-400">
                          PAID {order.paid_items_count}
                        </span>
                      </div>
                      <dl className="mt-4 space-y-2 border-t border-gray-200/80 pt-3 text-sm dark:border-gray-600">
                        <div className="flex justify-between gap-3">
                          <dt className="text-gray-500">Biaya tambahan</dt>
                          <dd className="font-medium text-gray-800 dark:text-gray-200">
                            {order.additional_fee > 0 ? formatRupiah(order.additional_fee) : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-gray-500">Layanan plus</dt>
                          <dd className="font-medium text-brand-600 dark:text-brand-400">
                            {order.total_addon_fee > 0 ? (
                              <span title={order.addons?.map((a) => `${a.name} (x${a.count})`).join(", ")}>
                                {formatRupiah(order.total_addon_fee)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-gray-200/80 pt-2 dark:border-gray-600">
                          <dt className="font-semibold text-gray-800 dark:text-gray-100">Subtotal</dt>
                          <dd className={`font-bold ${totalOrder > 0 ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
                            {formatRupiah(totalOrder)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden lg:block">
                <div className="overflow-x-auto">
                    <Table className="w-full min-w-[56rem] border-collapse text-theme-sm">
                        <TableHeader>
                            <TableRow className="border-b border-gray-200 bg-gray-50/95 dark:border-gray-700 dark:bg-gray-900/55">
                                <TableHead className="text-center tabular-nums">No</TableHead>
                                <TableHead>Pesanan</TableHead>
                                <TableHead>Ringkasan item</TableHead>
                                <TableHead className="border-l border-gray-200/90 text-right tabular-nums dark:border-gray-700" title="Biaya tambahan">
                                    Tambahan
                                </TableHead>
                                <TableHead className="text-right tabular-nums" title="Layanan tambahan / add-on">
                                    Layanan+
                                </TableHead>
                                <TableHead className="text-right tabular-nums">Subtotal</TableHead>
                                <TableHead className="text-center">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoice.orders.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="h-28 px-6 py-10 text-center text-theme-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Tidak ada data pesanan.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoice.orders.map((order, idx) => {
                                    const totalOrder =
                                        Number(order.additional_fee) + Number(order.total_addon_fee || 0);
                                    return (
                                        <TableRow
                                            key={order.id}
                                            className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50/90 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                                        >
                                            <TableCell
                                                className={twMerge(
                                                    orderCellBase,
                                                    "align-top text-center text-theme-sm font-medium tabular-nums text-gray-400 dark:text-gray-500"
                                                )}
                                            >
                                                {idx + 1}
                                            </TableCell>
                                            <TableCell className={twMerge(orderCellBase, "align-top")}>
                                                <div className="min-w-0 space-y-0.5">
                                                    <p className="font-semibold text-gray-900 dark:text-white">
                                                        {order.order_number}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatDate(order.created_at)}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className={twMerge(orderCellBase, "align-top")}>
                                                <div className="space-y-1.5">
                                                    <p className="font-medium text-gray-800 dark:text-gray-200">
                                                        {order.total_items} item
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <span className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/25 dark:text-green-400">
                                                            Free {order.free_items_used}
                                                        </span>
                                                        <span className="inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/25 dark:text-red-400">
                                                            Paid {order.paid_items_count}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell
                                                className={twMerge(
                                                    orderCellBase,
                                                    "align-top whitespace-nowrap border-l border-gray-100 text-right text-theme-sm font-medium tabular-nums text-gray-600 dark:border-gray-800 dark:text-gray-400"
                                                )}
                                            >
                                                {order.additional_fee > 0
                                                    ? formatRupiah(order.additional_fee)
                                                    : "—"}
                                            </TableCell>
                                            <TableCell
                                                className={twMerge(
                                                    orderCellBase,
                                                    "align-top whitespace-nowrap text-right text-theme-sm font-medium tabular-nums text-gray-600 dark:text-gray-400"
                                                )}
                                            >
                                                {order.total_addon_fee > 0 ? (
                                                    <span
                                                        className="text-brand-600 dark:text-brand-400"
                                                        title={order.addons
                                                            ?.map((a) => `${a.name} (x${a.count})`)
                                                            .join(", ")}
                                                    >
                                                        {formatRupiah(order.total_addon_fee)}
                                                    </span>
                                                ) : (
                                                    "—"
                                                )}
                                            </TableCell>
                                            <TableCell
                                                className={twMerge(
                                                    orderCellBase,
                                                    "align-top whitespace-nowrap text-right tabular-nums"
                                                )}
                                            >
                                                <span
                                                    className={`text-theme-sm font-bold ${totalOrder > 0 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
                                                >
                                                    {formatRupiah(totalOrder)}
                                                </span>
                                            </TableCell>
                                            <TableCell className={twMerge(orderCellBase, "align-middle text-center")}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/15 dark:hover:text-brand-400"
                                                    title="Lihat detail pesanan"
                                                    aria-label="Lihat detail pesanan"
                                                >
                                                    <svg
                                                        className="h-[18px] w-[18px]"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                        />
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                        />
                                                    </svg>
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar / Status Management */}
        <div className="space-y-6 lg:space-y-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-3xl sm:p-6 lg:p-8">
                <h3 className="mb-5 text-lg font-bold text-gray-900 dark:text-white sm:mb-6">Manajemen Status</h3>
                
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="invoice-status" className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                          Ubah status invoice
                        </label>
                        <select
                            id="invoice-status"
                            value={invoice.status}
                            onChange={(e) => handleUpdateStatus(e.target.value as InvoiceStatus)}
                            disabled={updating}
                            className="invoice-detail-print-hide h-12 w-full cursor-pointer appearance-none rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 shadow-sm transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        >
                            <option value="unpaid">Belum Dibayar</option>
                            <option value="paid">Lunas</option>
                            <option value="failed">Gagal</option>
                            <option value="cancelled">Dibatalkan</option>
                        </select>
                        {/* Status read-only when printing */}
                        <p className="hidden print:block text-sm font-bold text-gray-900 dark:text-white">
                          Status: {invoiceStatusLabel(invoice.status)}
                        </p>
                    </div>

                    {invoice.status === "paid" && (
                        <div className="space-y-2 rounded-2xl border border-green-100 bg-green-50 p-4 dark:border-green-800/30 dark:bg-green-900/10">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-green-700 dark:text-green-400">Informasi pembayaran</p>
                            <p className="text-sm text-green-800 dark:text-green-300">
                                Ditandai lunas pada{" "}
                                <span className="font-bold">{formatDateTime(invoice.paid_at)}</span>
                            </p>
                        </div>
                    )}

                    <div className="h-px bg-gray-100 dark:bg-gray-700" />

                    <div className="space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Aktivitas</p>
                        <div className="flex gap-3">
                            <div className="mt-0.5 h-10 w-1 shrink-0 rounded-full bg-brand-200 dark:bg-brand-900/40" />
                            <div className="min-w-0 space-y-0.5">
                                <p className="text-sm font-bold text-gray-800 dark:text-white">Dibuat otomatis</p>
                                <p className="text-xs text-gray-500">{formatDateTime(invoice.created_at)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-brand-600 p-6 text-white shadow-xl shadow-brand-500/25 sm:rounded-3xl sm:p-8">
                <div className="relative z-10 space-y-4">
                    <h4 className="text-lg font-bold">Ringkasan cepat</h4>
                    <div className="space-y-3">
                        <div className="flex justify-between gap-4 text-sm font-medium text-brand-100">
                            <span>Banyak pesanan</span>
                            <span className="font-bold text-white">{invoice.orders.length}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-sm font-medium text-brand-100">
                            <span>Total item</span>
                            <span className="text-right font-bold text-white">
                                {invoice.orders.reduce((sum, o) => sum + o.total_items, 0)} pakaian
                            </span>
                        </div>
                    </div>
                </div>
                <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl transition-transform duration-700 group-hover:scale-150" />
            </div>
        </div>
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          appName={siteName}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}

function TableHead({
    className,
    children,
    ...props
}: ComponentPropsWithoutRef<"th">) {
    return (
        <th
            className={twMerge(
                "px-3 py-3.5 text-left text-xs font-semibold leading-snug text-gray-600 first:pl-4 last:pr-4 dark:text-gray-400 lg:px-4 lg:py-3.5 lg:first:pl-6 lg:last:pr-6",
                className
            )}
            {...props}
        >
            {children}
        </th>
    );
}
