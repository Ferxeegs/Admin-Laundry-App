import { useEffect, useState } from "react";
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
import { orderAPI } from "../../utils/api";
import { EyeIcon, PencilIcon, TrashBinIcon } from "../../icons";
import { ConfirmModal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useAuth } from "../../context/AuthContext";

interface Order {
  id: string;
  order_number: string;
  student_id: string;
  total_items: number;
  free_items_used: number;
  paid_items_count: number;
  additional_fee: number;
  current_status: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  student?: {
    id: string;
    fullname: string;
    unique_code: string | null;
  };
}

export default function OrdersList() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const canViewOrder = hasPermission("view_order");
  const canCreateOrder = hasPermission("create_order");
  const canUpdateOrder = hasPermission("update_order");
  const canDeleteOrder = hasPermission("delete_order");

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "">("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  // Modal states
  const { isOpen: isDeleteModalOpen, openModal: openDeleteModal, closeModal: closeDeleteModal } = useModal();
  const [selectedOrderForDelete, setSelectedOrderForDelete] = useState<{ id: string; orderNumber: string } | null>(null);

  const fetchOrders = async (forceLoading = false) => {
    if (forceLoading || orders.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await orderAPI.getAllOrders({
        page,
        limit: 10,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });

      if (response.success && response.data) {
        setOrders(response.data.orders as Order[]);
        setPagination(response.data.pagination);
      } else {
        setError(response.message || "Gagal mengambil data order");
        console.error("Orders response:", response);
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch orders error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchOrders();
      } else {
        setPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case "RECEIVED":
        return "Diterima";
      case "WASHING_DRYING":
        return "Cuci / Kering";
      case "IRONING":
        return "Setrika";
      case "COMPLETED":
        return "Selesai";
      case "PICKED_UP":
        return "Diambil";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string): "primary" | "success" | "warning" | "info" => {
    switch (status) {
      case "RECEIVED":
        return "info";
      case "WASHING_DRYING":
      case "IRONING":
        return "warning";
      case "COMPLETED":
        return "primary";
      case "PICKED_UP":
        return "success";
      default:
        return "info";
    }
  };

  const handleDeleteClick = (orderId: string, orderNumber: string) => {
    setSelectedOrderForDelete({ id: orderId, orderNumber });
    openDeleteModal();
  };

  const handleDelete = async () => {
    if (!selectedOrderForDelete) return;

    const orderId = selectedOrderForDelete.id;
    setDeletingOrderId(orderId);
    setError(null);
    closeDeleteModal();

    try {
      const response = await orderAPI.deleteOrder(orderId);

      if (response.success) {
        fetchOrders();
        setSelectedOrders(new Set());
      } else {
        setError(response.message || "Gagal menghapus order");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan saat menghapus order");
      console.error("Delete order error:", err);
    } finally {
      setDeletingOrderId(null);
      setSelectedOrderForDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) return;

    setIsBulkDeleting(true);
    setError(null);

    try {
      const deletePromises = Array.from(selectedOrders).map((orderId) =>
        orderAPI.deleteOrder(orderId)
      );

      const results = await Promise.all(deletePromises);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        setError(`Gagal menghapus ${failed.length} dari ${selectedOrders.size} order`);
      } else {
        setSelectedOrders(new Set());
        fetchOrders();
      }
    } catch (err: any) {
      setError("Terjadi kesalahan saat menghapus order");
      console.error("Bulk delete error:", err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleToggleSelect = (orderId: string) => {
    setSelectedOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map((order) => order.id)));
    }
  };

  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      // Clear selection when exiting selection mode
      setSelectedOrders(new Set());
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Bulk Actions Bar */}
      {canDeleteOrder && isSelectionMode && selectedOrders.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {selectedOrders.size} pesanan dipilih
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedOrders(new Set())}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              Batal
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBulkDeleting ? "Menghapus..." : `Hapus ${selectedOrders.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Cari nomor pesanan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 sm:h-11 rounded-lg border border-gray-200 bg-transparent py-2 pl-10 sm:pl-12 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
          />
          <svg
            className="absolute -translate-y-1/2 left-3 sm:left-4 top-1/2 fill-gray-500 dark:fill-gray-400"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 sm:h-11 px-3 text-xs sm:text-sm rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white/90"
          >
            <option value="">Semua Status</option>
            <option value="RECEIVED">Diterima</option>
            <option value="WASHING_DRYING">Cuci / Kering</option>
            <option value="IRONING">Setrika</option>
            <option value="COMPLETED">Selesai</option>
            <option value="PICKED_UP">Diambil</option>
          </select>
          {/* Mode pilih (hapus massal): mobile + desktop — checkbox tabel hanya saat mode ini aktif */}
          {canDeleteOrder && (
            <>
              <button
                type="button"
                onClick={handleToggleSelectionMode}
                className={`md:hidden inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg touch-manipulation transition-colors ${
                  isSelectionMode
                    ? "text-white bg-brand-500 hover:bg-brand-600"
                    : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isSelectionMode ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  )}
                </svg>
                {isSelectionMode ? "Batal" : "Pilih"}
              </button>
              <button
                type="button"
                onClick={handleToggleSelectionMode}
                className={`hidden md:inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isSelectionMode
                    ? "text-white bg-brand-500 hover:bg-brand-600"
                    : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isSelectionMode ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  )}
                </svg>
                {isSelectionMode ? "Batal pilih" : "Pilih pesanan"}
              </button>
            </>
          )}
          {canCreateOrder && (
            <button
              type="button"
              onClick={() => navigate("/orders/create")}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation"
            >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="hidden sm:inline">Tambah Pesanan</span>
            <span className="sm:hidden">Tambah</span>
          </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 sm:p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-2">
        {isLoading && orders.length === 0 ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="p-3 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 animate-pulse"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 bg-gray-200 rounded w-1/2 dark:bg-gray-700" />
                    <div className="h-3 bg-gray-200 rounded w-1/3 dark:bg-gray-700" />
                  </div>
                  <div className="h-5 w-16 bg-gray-200 rounded-full dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500 dark:text-gray-400 text-sm text-center">
              {search ? "Tidak ada pesanan yang ditemukan" : "Belum ada pesanan"}
            </div>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className={`p-3 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 transition-colors ${
                !isSelectionMode && canViewOrder
                  ? "active:bg-gray-50 dark:active:bg-gray-700/50 cursor-pointer"
                  : ""
              }`}
              onClick={
                !isSelectionMode && canViewOrder
                  ? () => navigate(`/orders/${order.id}`)
                  : undefined
              }
            >
              <div className="flex items-start gap-2 mb-2.5">
                {/* Checkbox - Only show in selection mode */}
                {canDeleteOrder && isSelectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedOrders.has(order.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(order.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500 focus:ring-2 cursor-pointer"
                  />
                )}
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm dark:text-white/90 truncate">
                        {order.order_number}
                      </p>
                      {order.student && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 font-medium">
                          {order.student.fullname}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                    <Badge size="sm" color={getStatusColor(order.current_status)}>
                      {formatStatus(order.current_status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Total Item: {order.total_items}</span>
                    <span>Berbayar: {order.paid_items_count}</span>
                  </div>
                </div>
              </div>
              {/* Action Buttons - Only show in selection mode */}
              {canDeleteOrder && isSelectionMode && (
                <div className="flex items-center justify-end flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  {canViewOrder && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${order.id}`);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                      Lihat
                    </button>
                  )}
                  {canUpdateOrder && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${order.id}/edit`);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(order.id, order.order_number);
                    }}
                    disabled={deletingOrderId === order.id}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashBinIcon className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto custom-scrollbar">
          {isLoading && orders.length === 0 ? (
            <TableSkeleton rows={10} columns={6} showAvatar={false} />
          ) : orders.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                {search ? "Tidak ada pesanan yang ditemukan" : "Belum ada pesanan"}
              </div>
            </div>
          ) : (
            <div style={{ animation: "fadeIn 0.3s ease-in-out forwards" }}>
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    {canDeleteOrder && isSelectionMode && (
                      <TableCell
                        isHeader
                        className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-12"
                      >
                        <input
                          type="checkbox"
                          checked={selectedOrders.size === orders.length && orders.length > 0}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500 focus:ring-2 cursor-pointer"
                        />
                      </TableCell>
                    )}
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Nomor Pesanan
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Nama Siswa
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Total Item
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Tambahan Biaya
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Tanggal
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      {canDeleteOrder && isSelectionMode && (
                        <TableCell className="px-5 py-4 w-12">
                          <input
                            type="checkbox"
                            checked={selectedOrders.has(order.id)}
                            onChange={() => handleToggleSelect(order.id)}
                            className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500 focus:ring-2 cursor-pointer"
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-5 py-4">
                        <div
                          className={
                            canViewOrder
                              ? "cursor-pointer font-medium text-gray-800 text-theme-sm dark:text-white/90"
                              : "font-medium text-gray-800 text-theme-sm dark:text-white/90"
                          }
                          onClick={() => {
                            if (canViewOrder) navigate(`/orders/${order.id}`);
                          }}
                        >
                          {order.order_number}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <div className="text-gray-800 text-theme-sm dark:text-white/90">
                          {order.student ? (
                            <span className="font-medium">{order.student.fullname}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                        {order.total_items} (Free: {order.free_items_used}, Paid:{" "}
                        {order.paid_items_count})
                      </TableCell>
                      <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                        Rp {order.additional_fee.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Badge
                          size="sm"
                          color={getStatusColor(order.current_status)}
                        >
                          {formatStatus(order.current_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatDate(order.created_at)}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <div className="flex items-center flex-wrap gap-2">
                          {canViewOrder && (
                            <button
                              type="button"
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                navigate(`/orders/${order.id}`);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                              title="Lihat Detail"
                            >
                              <EyeIcon className="w-4 h-4 fill-current" />
                            </button>
                          )}
                          {canUpdateOrder && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/orders/${order.id}/edit`);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                              title="Edit Order"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteOrder && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(order.id, order.order_number);
                              }}
                              disabled={deletingOrderId === order.id}
                              className="inline-flex items-center justify-center w-8 h-8 text-red-500 transition-colors rounded-lg hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-800 dark:hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Order"
                            >
                              <TrashBinIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
            Menampilkan {(page - 1) * pagination.limit + 1} -{" "}
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
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={page === pagination.totalPages}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title="Hapus Pesanan"
        message={
          <>
            Apakah Anda yakin ingin menghapus pesanan <strong className="text-gray-800 dark:text-white">{selectedOrderForDelete?.orderNumber}</strong>?
          </>
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={deletingOrderId === selectedOrderForDelete?.id}
        showWarning={true}
        warningMessage="Tindakan ini akan menghapus pesanan dan semua data tracking terkait secara permanen."
      />
    </div>
  );
}


