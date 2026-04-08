import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import TableSkeleton from "../../components/common/TableSkeleton";
import Badge from "../../components/ui/badge/Badge";
import Label from "../../components/form/Label";
import { Modal } from "../../components/ui/modal";
import StatusLogModal from "../../components/Orders/StatusLogModal";
import { orderAPI, studentAPI, userAPI, mediaAPI, settingAPI, getBaseUrl } from "../../utils/api";
import { compressOrderImage } from "../../utils/compressOrderImage";
import { AngleLeftIcon, PencilIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

interface OrderTracking {
  id: string;
  order_id: string;
  staff_id: string | null;
  status_to: string;
  notes: string | null;
  created_at: string;
}

interface OrderAddonLine {
  id: string;
  addon_id: string;
  name: string;
  price: number;
  count: number;
  subtotal: number;
}

interface Order {
  id: string;
  order_number: string;
  student_id: string;
  total_items: number;
  free_items_used: number;
  paid_items_count: number;
  additional_fee: number;
  total_addon_fee?: number;
  current_status: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  addons?: OrderAddonLine[];
  trackings: OrderTracking[];
}

interface Student {
  id: string;
  student_number: string;
  fullname: string;
  phone_number?: string | null;
  guardian_name?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  created_by?: string | null;
  deleted_by?: string | null;
  /** jika ada di API */
  unique_code?: string | null;
  national_id_number?: string | null;
}

interface Staff {
  id: string;
  fullname: string | null;
  firstname: string;
  lastname: string;
  username: string;
}

interface Media {
  id: number;
  url: string;
  file_name: string;
  mime_type: string;
  size: number;
}

/** Status proses cuci/setrika (termasuk nilai lawas sebelum migrasi DB). */
const PROCESS_TRACKING_STATUSES = new Set(["WASHING", "IRONING"]);

function findEarliestProcessTracking(trackings: OrderTracking[]): OrderTracking | undefined {
  const candidates = trackings.filter((t) => PROCESS_TRACKING_STATUSES.has(t.status_to));
  if (candidates.length === 0) return undefined;
  return [...candidates].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
}

export default function ViewOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [staffMap, setStaffMap] = useState<Record<string, Staff>>({});
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [statusNotes, setStatusNotes] = useState<string>("");
  const [statusImage, setStatusImage] = useState<File | null>(null);
  const [statusImagePreview, setStatusImagePreview] = useState<string | null>(null);
  const [isCompressingStatusImage, setIsCompressingStatusImage] = useState(false);
  const [images, setImages] = useState<Media[]>([]);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [weeklyQuotaLimit, setWeeklyQuotaLimit] = useState(28);
  // const [ , setPricePerItem] = useState<number>(4000); // Default value
  const { success, error: showError } = useToast();
  const { hasPermission } = useAuth();
  const canUpdateOrder = hasPermission("update_order");

  const handleStatusImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showError("Hanya file gambar yang diizinkan.");
      e.target.value = "";
      return;
    }

    setIsCompressingStatusImage(true);
    try {
      const compressed = await compressOrderImage(file);
      setStatusImage(compressed);
      const reader = new FileReader();
      reader.onloadend = () => {
        setStatusImagePreview(reader.result as string);
      };
      reader.readAsDataURL(compressed);
    } catch {
      showError("Gagal memproses gambar. Coba lagi atau pilih gambar lain.");
      setStatusImage(null);
      setStatusImagePreview(null);
    } finally {
      setIsCompressingStatusImage(false);
      e.target.value = "";
    }
  };

  const handleRemoveStatusImage = () => {
    setStatusImage(null);
    setStatusImagePreview(null);
    const fileInput = document.getElementById("view-order-status-image-input") as HTMLInputElement;
    const cameraInput = document.getElementById("view-order-status-camera") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
    if (cameraInput) cameraInput.value = "";
  };

  useEffect(() => {
    if (id) {
      fetchOrderData();
    }
    // fetchOrderSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const parseMediaArray = (data: unknown): Media[] => {
    if (!data) return [];
    if (typeof data === "object" && data !== null && "media" in data && Array.isArray((data as { media: unknown }).media)) {
      return (data as { media: Media[] }).media;
    }
    if (Array.isArray(data)) {
      return data as Media[];
    }
    return [];
  };

  const firstImageDisplayUrl = (data: unknown): string | null => {
    const mediaArray = parseMediaArray(data);
    if (mediaArray.length === 0) return null;
    const u = mediaArray[0].url;
    return u.startsWith("http")
      ? u
      : `${getBaseUrl()}${u.startsWith("/") ? u : `/${u}`}`;
  };

  const fetchOrderImages = async (orderId: string) => {
    try {
      const response = await mediaAPI.getMediaByModel("Order", orderId, "images");
      if (response.success && response.data) {
        setImages(parseMediaArray(response.data));
      }
    } catch (err) {
      console.error("Fetch order images error:", err);
    }
  };

  const getRowImageUrl = useCallback(async (log: {
    status: string;
    orderId?: string;
    trackingId?: string | null;
  }): Promise<string | null> => {
    if (log.status === "RECEIVED" && log.orderId) {
      try {
        const response = await mediaAPI.getMediaByModel("Order", log.orderId, "images");
        if (response.success && response.data) {
          return firstImageDisplayUrl(response.data);
        }
      } catch (err) {
        console.error("Error fetching order images for status log:", err);
      }
      return null;
    }
    if (log.trackingId) {
      try {
        const response = await mediaAPI.getMediaByModel("OrderTracking", log.trackingId, "status_update");
        if (response.success && response.data) {
          return firstImageDisplayUrl(response.data);
        }
      } catch (err) {
        console.error("Error fetching tracking image:", err);
      }
    }
    return null;
  }, []);

  // const fetchOrderSettings = async () => {
  //   try {
  //     const response = await settingAPI.getByGroup("order");
  //     if (response.success && response.data) {
  //       const pricePerItemValue = response.data.price_per_item;
  //       if (pricePerItemValue !== null && pricePerItemValue !== undefined) {
  //         const price = typeof pricePerItemValue === 'string' 
  //           ? parseFloat(pricePerItemValue) 
  //           : Number(pricePerItemValue);
  //         if (!isNaN(price)) {
  //           setPricePerItem(price);
  //         }
  //       }
  //     }
  //   } catch (err) {
  //     console.error("Fetch order settings error:", err);
  //     // Keep default value if fetch fails
  //   }
  // };

  const fetchOrderData = async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const [response, settingsResponse] = await Promise.all([
        orderAPI.getOrderById(id),
        settingAPI.getByGroup("order"),
      ]);

      if (settingsResponse.success && settingsResponse.data) {
        const mq = settingsResponse.data.monthly_quota;
        const q =
          typeof mq === "number" ? mq : typeof mq === "string" ? parseInt(mq, 10) || 28 : 28;
        setWeeklyQuotaLimit(q);
      }

      if (response.success && response.data) {
        const orderData = response.data as Order;
        setOrder(orderData);
        
        // Fetch student data
        if (orderData.student_id) {
          try {
            const studentResponse = await studentAPI.getStudentById(orderData.student_id);
            if (studentResponse.success && studentResponse.data) {
              setStudent(studentResponse.data);
            }
          } catch (err) {
            console.error("Fetch student error:", err);
          }
        }

        // Fetch staff data for all trackings
        const staffIds = new Set<string>();
        if (orderData.created_by) staffIds.add(orderData.created_by);
        orderData.trackings.forEach(tracking => {
          if (tracking.staff_id) staffIds.add(tracking.staff_id);
        });

        // Fetch all staff data in parallel
        if (staffIds.size > 0) {
          const staffDataMap: Record<string, Staff> = {};
          const staffPromises = Array.from(staffIds).map(async (staffId) => {
            try {
              const userResponse = await userAPI.getUserById(staffId);
              if (userResponse.success && userResponse.data) {
                return {
                  id: staffId,
                  data: {
                    id: userResponse.data.id,
                    fullname: userResponse.data.fullname,
                    firstname: userResponse.data.firstname,
                    lastname: userResponse.data.lastname,
                    username: userResponse.data.username,
                  }
                };
              }
            } catch (err) {
              console.error(`Fetch staff ${staffId} error:`, err);
            }
            return null;
          });

          const staffResults = await Promise.all(staffPromises);
          staffResults.forEach(result => {
            if (result && result.data) {
              staffDataMap[result.id] = result.data;
            }
          });
          
          setStaffMap(staffDataMap);
        }

        // Fetch order images
        await fetchOrderImages(orderData.id);
      } else {
        setError(response.message || "Gagal mengambil data order");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch order error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return "Hari ini";
    } else if (d.toDateString() === yesterday.toDateString()) {
      return "Kemarin";
    } else {
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  };

  const formatLogDateTime = (date: string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${minutes}`;
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case "RECEIVED":
        return "Diterima";
      case "WASHING":
      case "WASHING_DRYING":
        return "Cuci/Kering";
      case "IRONING":
        return "Setrika";
      case "WASHING_IRONING":
        return "Cuci-setrika";
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
      case "WASHING":
      case "WASHING_DRYING":
      case "WASHING_IRONING":
        return "warning";
      case "IRONING":
        return "warning"; // Or maybe another color if available, but warning (orange/yellow) fits process
      case "COMPLETED":
        return "primary";
      case "PICKED_UP":
        return "success";
      default:
        return "info";
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const statusFlow: Record<string, string> = {
      RECEIVED: "WASHING",
      WASHING: "IRONING",
      IRONING: "COMPLETED",
      COMPLETED: "PICKED_UP",
      PICKED_UP: "",
      // Legacy data mapping:
      WASHING_IRONING: "COMPLETED",
      WASHING_DRYING: "IRONING",
    };
    const next = statusFlow[currentStatus];
    return next === "" || next === undefined ? null : next;
  };

  const getAllStatuses = (): string[] => {
    return ["RECEIVED", "WASHING", "IRONING", "COMPLETED", "PICKED_UP"];
  };

  const getStatusIndex = (status: string): number => {
    if (status === "WASHING_IRONING") return 2; // Map legacy to COMPLETED or maybe IRONING? 
    // Actually, if it's "WASHING_IRONING", it was the last step before "COMPLETED". 
    // In new flow, WASHING is 1, IRONING is 2, COMPLETED is 3. 
    // So WASHING_IRONING (old) is roughly equivalent to having finished both, or at least being in the process.
    // Let's map legacy:
    const legacyMap: Record<string, string> = {
      WASHING_DRYING: "WASHING",
      WASHING_IRONING: "IRONING",
    };
    const normalized = legacyMap[status] || status;
    return getAllStatuses().indexOf(normalized);
  };

  const canEditOrder = (status: string): boolean => {
    return status === "RECEIVED";
  };

  const getStaffName = (staffId: string | null): string => {
    if (!staffId) return "-";
    const staff = staffMap[staffId];
    if (staff) {
      // Prioritize fullname, fallback to firstname + lastname, then username
      if (staff.fullname && staff.fullname.trim()) {
        return staff.fullname;
      }
      const name = `${staff.firstname} ${staff.lastname}`.trim();
      return name || staff.username || "-";
    }
    // If staff data not loaded yet, return empty string (will be hidden)
    return "";
  };

  const getStatusLogData = () => {
    const logData: Array<{
      dateTime: string;
      action: string;
      status: string;
      staffId: string | null;
      notes: string | null;
      trackingId: string | null;
      orderId?: string;
    }> = [];

    // Baris RECEIVED: catatan & gambar dari order (notes + media Order), bukan OrderTracking
    if (order) {
      logData.push({
        dateTime: order.created_at || "",
        action: "RECEIVED",
        status: "RECEIVED",
        staffId: order.created_by,
        notes: order.notes ?? null,
        trackingId: null,
        orderId: order.id,
      });
    }

    // Add other statuses from trackings
    order?.trackings.forEach(tracking => {
      if (tracking.status_to !== "RECEIVED") {
        logData.push({
          dateTime: tracking.created_at,
          action: tracking.status_to,
          status: tracking.status_to,
          staffId: tracking.staff_id,
          notes: tracking.notes,
          trackingId: tracking.id,
        });
      }
    });

    // Sort by date descending (newest first)
    return logData.sort((a, b) => 
      new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
    );
  };

  const statusLogRows = useMemo(() => getStatusLogData(), [order]);

  const handleOpenStatusModal = () => {
    setStatusNotes("");
    setStatusImage(null);
    setStatusImagePreview(null);
    setIsCompressingStatusImage(false);
    setIsStatusModalOpen(true);
  };

  const handleCloseStatusModal = () => {
    setIsStatusModalOpen(false);
    setStatusNotes("");
    setStatusImage(null);
    setStatusImagePreview(null);
    setIsCompressingStatusImage(false);
  };

  const handleOpenImageModal = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setIsImageModalOpen(false);
  };

  const handleNextImage = () => {
    if (images.length > 0) {
      setSelectedImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const handlePrevImage = () => {
    if (images.length > 0) {
      setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  const handleUpdateStatus = async () => {
    if (!id || !order) return;

    const nextStatus = getNextStatus(order.current_status);
    if (!nextStatus) return;

    setIsUpdatingStatus(true);
    setError(null);

    try {
      const response = await orderAPI.createOrderTracking(id, {
        status_to: nextStatus,
        notes: statusNotes.trim() || null,
      });

      if (response.success) {
        if (statusImage && response.data?.trackings && response.data.trackings.length > 0) {
          const latestTracking = response.data.trackings[response.data.trackings.length - 1];
          const uploadResult = await mediaAPI.uploadMedia(
            statusImage,
            "OrderTracking",
            latestTracking.id,
            "status_update"
          );
          if (!uploadResult.success) {
            showError(
              uploadResult.message ||
                "Gagal mengunggah foto status. Status order tetap diperbarui; silakan unggah foto dari log status jika perlu."
            );
          }
        }
        await fetchOrderData();
        handleCloseStatusModal();
        success("Status order berhasil diupdate!");
      } else {
        const errorMessage = response.message || "Gagal mengupdate status order";
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = "Terjadi kesalahan saat mengupdate status. Silakan coba lagi.";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Update status error:", err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View Order" />
        <PageMeta title="View Order" description="View order details" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={6} columns={2} />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View Order" />
        <PageMeta title="View Order" description="View order details" />
        <ComponentCard title="Error">
          <div className="p-5 text-center">
            <p className="text-red-600 dark:text-red-400">
              {error || "Order tidak ditemukan"}
            </p>
            <button
              onClick={() => navigate("/orders")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
            >
              Kembali ke Daftar Order
            </button>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageBreadcrumb pageTitle="Detail Pesanan" />
      <PageMeta title="Detail Pesanan" description="Detail pesanan details" />

      {/* Header - Mobile Optimized */}
      <div className="flex items-center gap-2 sm:gap-3 pb-2 sm:pb-0">
        <Link
          to="/orders"
          className="inline-flex items-center justify-center w-10 h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white touch-manipulation flex-shrink-0"
        >
          <AngleLeftIcon className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-xl lg:text-2xl font-semibold text-gray-800 dark:text-white truncate">
            {order.order_number}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
            Detail informasi pesanan laundry
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge size="md" color={getStatusColor(order.current_status)}>
            {formatStatus(order.current_status)}
          </Badge>
          {canEditOrder(order.current_status) && hasPermission("update_order") && (
            <Link
              to={`/orders/${order.id}/edit`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation sm:px-4 sm:py-2.5"
            >
              <PencilIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Pesanan</span>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Progress Status Section (moved to top) */}
        <div className="space-y-4">
          <ComponentCard title="Progress Status">
            <div className="space-y-6">
              {/* Header with View Log Button */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Alur Proses Pesanan
                </h3>
                <button
                  onClick={() => setIsLogModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Log Pesanan
                </button>
              </div>
              {/* Progress Bar */}
              <div className="relative">
                {/* Mobile: Vertical Timeline */}
                <div className="block sm:hidden space-y-4">
                  {getAllStatuses().map((status, index) => {
                    const currentIndex = getStatusIndex(order.current_status);
                    const isCompleted = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    const isReceived = status === "RECEIVED";
                    // For RECEIVED, use order.created_at; for others, use tracking
                    const tracking = isReceived
                      ? null
                      : status === "WASHING_IRONING"
                        ? findEarliestProcessTracking(order.trackings)
                        : order.trackings.find((t) => t.status_to === status);
                    const statusTime = isReceived ? order.created_at : tracking?.created_at;
                    const statusStaff = isReceived ? order.created_by : tracking?.staff_id;
                    
                    return (
                      <div key={status} className="flex gap-3 relative">
                        {index < getAllStatuses().length - 1 && (
                          <div className={`absolute left-[15px] top-10 bottom-0 w-0.5 ${
                            index < currentIndex ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                          }`} />
                        )}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                            isCompleted
                              ? "bg-brand-500 border-brand-500 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400"
                          } ${isCurrent ? "ring-2 ring-brand-500/30" : ""}`}
                        >
                          {isCompleted ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-xs font-semibold">{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold mb-1 ${
                                isCompleted ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"
                              }`}>
                                {formatStatus(status)}
                              </p>
                            </div>
                            {statusTime && (
                              <div className="flex-shrink-0 text-right">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {formatTime(statusTime)}
                                </p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {formatDate(statusTime)}
                                </p>
                              </div>
                            )}
                          </div>
                          {statusStaff && getStaffName(statusStaff) && (
                            <div className="mb-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Oleh: <span className="font-medium text-gray-700 dark:text-gray-300">{getStaffName(statusStaff)}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: Horizontal Progress Bar */}
                <div className="hidden sm:block relative">
                  <div className="flex items-start justify-between mb-6">
                    {getAllStatuses().map((status, index) => {
                      const currentIndex = getStatusIndex(order.current_status);
                      const isCompleted = index <= currentIndex;
                      const isCurrent = index === currentIndex;
                      const isReceived = status === "RECEIVED";
                      const tracking = isReceived
                        ? null
                        : status === "WASHING_IRONING"
                          ? findEarliestProcessTracking(order.trackings)
                          : order.trackings.find((t) => t.status_to === status);
                      const statusTime = isReceived ? order.created_at : tracking?.created_at;
                      const statusStaff = isReceived ? order.created_by : tracking?.staff_id;
                      
                      return (
                        <div key={status} className="flex flex-col items-center flex-1 relative">
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div
                              className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                                isCompleted
                                  ? "bg-brand-500 border-brand-500 text-white"
                                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400"
                              } ${isCurrent ? "ring-4 ring-brand-500/20 scale-110" : ""}`}
                            >
                              {isCompleted ? (
                                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className="text-xs md:text-sm font-semibold">{index + 1}</span>
                              )}
                            </div>
                            <div className="text-center w-full px-1">
                              <p className={`text-xs md:text-sm font-semibold mb-1.5 ${
                                isCompleted ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"
                              }`}>
                                {formatStatus(status)}
                              </p>
                              {statusTime && (
                                <div className="mb-1">
                                  <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                                    {formatTime(statusTime)}
                                  </p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {formatDate(statusTime)}
                                  </p>
                                </div>
                              )}
                              {statusStaff && getStaffName(statusStaff) && (
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                  <span className="font-medium text-gray-700 dark:text-gray-300">{getStaffName(statusStaff)}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {index < getAllStatuses().length - 1 && (
                            <div className={`absolute top-5 md:top-6 left-[calc(50%+20px)] md:left-[calc(50%+24px)] right-0 h-0.5 ${
                              index < currentIndex ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                </div>
              </div>

              {/* Next Status Button */}
              {getNextStatus(order.current_status) && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  {canUpdateOrder && (
                    <button
                    onClick={handleOpenStatusModal}

                    disabled={isUpdatingStatus}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    Lanjutkan ke {formatStatus(getNextStatus(order.current_status)!)}
                  </button>
                )}
                </div>
              )}
            </div>
          </ComponentCard>

          {/* Order Info */}
          <ComponentCard title="Informasi Pesanan">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Nomor Pesanan
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white break-all">
                  {order.order_number}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Siswa
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {student ? (
                    <>
                      {student.fullname}
                      {student.unique_code && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">
                          ({student.unique_code})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">Memuat data siswa...</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Jumlah Pakaian
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {order.total_items} pakaian
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Kuota Gratis Digunakan
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {order.free_items_used} dari {weeklyQuotaLimit} pakaian/minggu
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Pakaian Berbayar
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {order.paid_items_count} pakaian
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Biaya cuci (di luar kuota)
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  Rp {order.additional_fee.toLocaleString("id-ID")}
                </p>
              </div>
              {(order.addons?.length ?? 0) > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Layanan tambahan
                  </p>
                  <ul className="text-sm text-gray-800 dark:text-white space-y-1 rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {order.addons!.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap justify-between gap-2 px-3 py-2"
                      >
                        <span>
                          {row.name}{" "}
                          <span className="text-gray-500 dark:text-gray-400">
                            ×{row.count} @ Rp {row.price.toLocaleString("id-ID")}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">
                          Rp {row.subtotal.toLocaleString("id-ID")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Subtotal addon: Rp {(order.total_addon_fee ?? 0).toLocaleString("id-ID")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Total tagihan (cuci + tambahan)
                </p>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                  Rp{" "}
                  {(order.additional_fee + (order.total_addon_fee ?? 0)).toLocaleString("id-ID")}
                </p>
              </div>
              {order.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Catatan
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white whitespace-pre-line">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>
          </ComponentCard>

          {/* Order Images */}
          {images.length > 0 && (
            <ComponentCard title="Foto Pakaian">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((image, index) => {
                  const imageUrl = image.url.startsWith('http') 
                    ? image.url 
                    : `${getBaseUrl()}${image.url.startsWith('/') ? image.url : `/${image.url}`}`;
                  
                  return (
                    <div 
                      key={image.id} 
                      className="relative group cursor-pointer"
                      onClick={() => handleOpenImageModal(index)}
                    >
                      <img
                        src={imageUrl}
                        alt={image.file_name}
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700 hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center pointer-events-none">
                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ComponentCard>
          )}

          <ComponentCard title="Metadata">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Dibuat Pada
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {formatDateTime(order.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Diperbarui Pada
                </p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {formatDateTime(order.updated_at)}
                </p>
              </div>
            </div>
          </ComponentCard>
        </div>
      </div>

      {/* Status Log Modal */}
      <StatusLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        logs={statusLogRows}
        getStaffName={getStaffName}
        formatLogDateTime={formatLogDateTime}
        formatStatus={formatStatus}
        getStatusColor={getStatusColor}
        getRowImageUrl={getRowImageUrl}
      />

      {/* Status Update Modal */}
      <Modal isOpen={isStatusModalOpen} onClose={handleCloseStatusModal} className="max-w-md">
        <div className="p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Update Status Pesanan
          </h2>
          
          <div className="mb-5">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Anda akan mengubah status pesanan dari{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatStatus(order.current_status)}
              </span>{" "}
              menjadi{" "}
              <span className="font-semibold text-brand-600 dark:text-brand-400">
                {formatStatus(getNextStatus(order.current_status)!)}
              </span>
            </p>
          </div>

          <div className="mb-5">
            <Label>
              Catatan (Opsional)
            </Label>
            <textarea
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="Masukkan catatan untuk perubahan status..."
              rows={3}
              disabled={isUpdatingStatus || isCompressingStatusImage}
              className="w-full mt-2 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
            />
          </div>

          <div className="mb-5">
            <Label>Foto (Opsional)</Label>
            <div className="mt-2 space-y-3">
              {statusImagePreview ? (
                <div className="relative">
                  <img
                    src={statusImagePreview}
                    alt="Preview"
                    className="h-48 w-full rounded-lg border border-gray-300 object-cover dark:border-gray-700"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveStatusImage}
                    disabled={isUpdatingStatus || isCompressingStatusImage}
                    className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  {isCompressingStatusImage && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Memampatkan gambar…</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label
                      htmlFor="view-order-status-image-input"
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Pilih dari Galeri
                    </label>
                    <label
                      htmlFor="view-order-status-camera"
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Ambil dari Kamera
                    </label>
                  </div>
                </>
              )}
              <input
                id="view-order-status-image-input"
                type="file"
                accept="image/*"
                onChange={handleStatusImageChange}
                disabled={isUpdatingStatus || isCompressingStatusImage}
                className="hidden"
              />
              <input
                id="view-order-status-camera"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleStatusImageChange}
                disabled={isUpdatingStatus || isCompressingStatusImage}
                className="hidden"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Foto akan diperkecil (maks. 1024px) dan dikompres ke WebP sebelum diunggah.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseStatusModal}
              disabled={isUpdatingStatus || isCompressingStatusImage}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleUpdateStatus}
              disabled={isUpdatingStatus || isCompressingStatusImage}
              className="px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingStatus
                ? "Mengupdate..."
                : isCompressingStatusImage
                  ? "Memampatkan gambar…"
                  : "Konfirmasi Update"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Image Modal */}
      {images.length > 0 && (
        <Modal isOpen={isImageModalOpen} onClose={handleCloseImageModal} className="max-w-7xl">
          <div className="relative">
            {/* Navigation Buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-12 h-12 text-white bg-black/50 hover:bg-black/70 rounded-full transition-colors backdrop-blur-sm"
                  aria-label="Gambar Sebelumnya"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleNextImage}
                  className="absolute right-16 sm:right-20 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-12 h-12 text-white bg-black/50 hover:bg-black/70 rounded-full transition-colors backdrop-blur-sm"
                  aria-label="Gambar Selanjutnya"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Image Container */}
            <div className="flex flex-col items-center justify-center min-h-[400px] max-h-[90vh] p-4">
              {images[selectedImageIndex] && (() => {
                const selectedImage = images[selectedImageIndex];
                const imageUrl = selectedImage.url.startsWith('http') 
                  ? selectedImage.url 
                  : `${getBaseUrl()}${selectedImage.url.startsWith('/') ? selectedImage.url : `/${selectedImage.url}`}`;
                
                return (
                  <>
                    <img
                      src={imageUrl}
                      alt={selectedImage.file_name}
                      className="max-w-full max-h-[80vh] object-contain rounded-lg"
                    />
                    {/* Image Info */}
                    <div className="mt-4 text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedImage.file_name}
                      </p>
                      {images.length > 1 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {selectedImageIndex + 1} dari {images.length}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


