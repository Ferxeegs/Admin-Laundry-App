import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import { orderAPI } from "../../utils/api";
import { AngleRightIcon } from "../../icons";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Diterima",
  WASHING_IRONING: "Cuci-setrika",
  WASHING_DRYING: "Cuci-setrika",
  IRONING: "Cuci-setrika",
  COMPLETED: "Selesai",
  PICKED_UP: "Diambil",
};

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "info"> = {
  RECEIVED: "warning",
  WASHING_IRONING: "warning",
  WASHING_DRYING: "warning",
  IRONING: "warning",
  COMPLETED: "success",
  PICKED_UP: "info",
};

const formatCurrency = (amount: number) =>
  `Rp ${Number(amount).toLocaleString("id-ID")}`;

interface OrderRow {
  id: string;
  order_number: string;
  current_status: string;
  total_items: number;
  additional_fee: number;
  total_addon_fee?: number;
  created_at: string | null;
  student?: { id: string; fullname: string; unique_code?: string | null };
}

export default function RecentOrdersTable() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOrders() {
      setLoading(true);
      setError(null);
      try {
        const res = await orderAPI.getAllOrders({ page: 1, limit: 6 });
        if (cancelled) return;
        if (res.success && res.data?.orders) {
          setOrders(res.data.orders);
        } else {
          setError(res.message || "Gagal memuat order");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div 
        className="flex flex-col h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)" }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800/70">
          <h3 
            className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em" }}
          >
            Order Terbaru
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Daftar pesanan terakhir yang masuk
          </p>
        </div>
        <div className="p-5 flex-1 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl bg-gray-50 dark:bg-gray-800/50 sm:h-14"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="flex flex-col h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)" }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800/70">
          <h3 
            className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em" }}
          >
            Order Terbaru
          </h3>
        </div>
        <div className="p-5 flex-1">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)" }}
    >
      <div className="px-5 pt-5 pb-3 border-b border-gray-50 dark:border-gray-800/70 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 
            className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em" }}
          >
            Order Terbaru
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Daftar pesanan terakhir yang masuk
          </p>
        </div>
        <Link
          to="/orders"
          className="inline-flex self-start sm:self-auto items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10"
        >
          Lihat semua
          <AngleRightIcon className="size-3.5 opacity-70" />
        </Link>
      </div>
      <div className="max-w-full flex-1 overflow-hidden">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="font-dm-sans whitespace-nowrap px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400"
              >
                No. Order
              </TableCell>
              <TableCell
                isHeader
                className="font-dm-sans px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400 w-full"
              >
                Siswa
              </TableCell>
              <TableCell
                isHeader
                className="font-dm-sans whitespace-nowrap px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400 hidden sm:table-cell"
              >
                Item
              </TableCell>
              <TableCell
                isHeader
                className="font-dm-sans whitespace-nowrap px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400 hidden sm:table-cell"
              >
                Total
              </TableCell>
              <TableCell
                isHeader
                className="font-dm-sans whitespace-nowrap px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400"
              >
                Status
              </TableCell>
              <TableCell
                isHeader
                className="font-dm-sans whitespace-nowrap px-2.5 sm:px-3 py-3 text-start text-[11px] font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400 hidden sm:table-cell"
              >
                Tanggal
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div 
                      className="rounded-2xl p-4"
                      style={{ background: "rgba(148,163,184,0.08)" }}
                    >
                      <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Keranjang kosong</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">Belum ada order hari ini</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group">
                  <TableCell className="whitespace-nowrap px-2.5 sm:px-3 py-3.5 text-sm">
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors dark:text-gray-100 dark:group-hover:text-brand-400"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {order.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-0 px-2 sm:px-3 py-3.5 text-sm text-gray-700 dark:text-gray-200 w-full relative">
                    <div className="flex flex-col max-w-[140px] xs:max-w-[160px] sm:max-w-xs overflow-hidden">
                      <span className="block truncate font-medium w-full">{order.student?.fullname ?? "-"}</span>
                      {order.student?.unique_code && (
                        <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wide truncate w-full">
                          {order.student.unique_code}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-2.5 sm:px-3 py-3.5 text-sm text-gray-600 dark:text-gray-300 font-medium hidden sm:table-cell">
                    {order.total_items}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-2.5 sm:px-3 py-3.5 text-sm text-gray-600 dark:text-gray-300 font-medium hidden sm:table-cell">
                    {formatCurrency(
                      order.additional_fee + (order.total_addon_fee ?? 0),
                    )}
                  </TableCell>
                  <TableCell className="px-2.5 sm:px-3 py-3.5">
                    <Badge
                      size="sm"
                      color={STATUS_COLOR[order.current_status] ?? "primary"}
                    >
                      {STATUS_LABEL[order.current_status] ?? order.current_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-2.5 sm:px-3 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {formatDate(order.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .font-dm-sans { font-family: 'DM Sans', sans-serif; }
      `}</style>
    </div>
  );
}
