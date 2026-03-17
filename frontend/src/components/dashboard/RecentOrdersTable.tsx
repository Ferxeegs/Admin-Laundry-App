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
  WASHING_DRYING: "Cuci & Kering",
  IRONING: "Setrika",
  COMPLETED: "Selesai",
  PICKED_UP: "Diambil",
};

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "info"> = {
  RECEIVED: "warning",
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
  created_at: string | null;
  student?: { id: string; fullname: string; unique_code: string | null };
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
        const res = await orderAPI.getAllOrders({ page: 1, limit: 8 });
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Order Terbaru
        </h3>
        <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-14"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Order Terbaru
        </h3>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Order Terbaru
        </h3>
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
        >
          Lihat semua
          <AngleRightIcon className="size-4" />
        </Link>
      </div>
      <div className="max-w-full overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3"
              >
                No. Order
              </TableCell>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3"
              >
                Siswa
              </TableCell>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3"
              >
                Item
              </TableCell>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3"
              >
                Biaya
              </TableCell>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3"
              >
                Status
              </TableCell>
              <TableCell
                isHeader
                className="whitespace-nowrap py-2.5 text-start text-xs font-medium text-gray-500 dark:text-gray-400 sm:py-3 hidden sm:table-cell"
              >
                Tanggal
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 sm:py-8">
                  Belum ada order
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="whitespace-nowrap py-2.5 text-sm sm:py-3">
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {order.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-[100px] py-2.5 text-sm text-gray-800 dark:text-white/90 sm:py-3">
                    <span className="block truncate max-w-[120px] sm:max-w-none">{order.student?.fullname ?? "-"}</span>
                    {order.student?.unique_code && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {order.student.unique_code}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-sm text-gray-600 dark:text-gray-300 sm:py-3">
                    {order.total_items}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-sm text-gray-600 dark:text-gray-300 sm:py-3">
                    {formatCurrency(order.additional_fee)}
                  </TableCell>
                  <TableCell className="py-2.5 sm:py-3">
                    <Badge
                      size="sm"
                      color={STATUS_COLOR[order.current_status] ?? "primary"}
                    >
                      {STATUS_LABEL[order.current_status] ?? order.current_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-sm text-gray-500 dark:text-gray-400 sm:py-3 hidden sm:table-cell">
                    {formatDate(order.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
