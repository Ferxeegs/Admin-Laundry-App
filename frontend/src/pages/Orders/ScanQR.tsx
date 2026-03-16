import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Html5Qrcode } from "html5-qrcode";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { studentAPI, mediaAPI, orderAPI, getBaseUrl } from "../../utils/api";
import { Modal } from "../../components/ui/modal";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
// import { AngleLeftIcon } from "../../icons";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";

interface Student {
  id: string;
  national_id_number: string;
  fullname: string;
  phone_number: string | null;
  dormitory: string | null;
  grade_level: string | null;
  unique_code: string | null;
  guardian_name: string | null;
  qr_code: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export default function ScanQR() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{
    id: string;
    order_number: string;
    current_status: string;
    total_items: number;
    created_at: string | null;
  } | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusNotes, setStatusNotes] = useState<string>("");
  const [statusImage, setStatusImage] = useState<File | null>(null);
  const [statusImagePreview, setStatusImagePreview] = useState<string | null>(null);
  const scannerElementId = "qr-reader";
  const { success, error: showError } = useToast();

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    try {
      setError(null);
      setScanError(null);
      setScannedStudent(null);
      setProfileImage(null);

      // Set scanning state first to render the element
      setIsScanning(true);

      // Wait for the element to be rendered in the DOM
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if element exists
      const element = document.getElementById(scannerElementId);
      if (!element) {
        setError("Elemen scanner tidak ditemukan. Silakan coba lagi.");
        setIsScanning(false);
        return;
      }

      // Create scanner instance
      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      // Get available cameras
      const devices = await Html5Qrcode.getCameras();
      
      if (devices && devices.length > 0) {
        // Use the first available camera (usually the back camera on mobile)
        const cameraId = devices[0].id;

        // Calculate QR box size based on screen width (responsive)
        const qrboxSize = Math.min(250, window.innerWidth * 0.7);
        
        await html5QrCode.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: qrboxSize, height: qrboxSize },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            // QR code scanned successfully
            handleQRCodeScanned(decodedText);
          },
          (errorMessage) => {
            // Ignore scanning errors (they're normal during scanning)
            // Only show error if it's not a "not found" error
            if (!errorMessage.includes("No QR code found")) {
              setScanError(errorMessage);
            }
          }
        );
      } else {
        setError("Tidak ada kamera yang tersedia. Pastikan perangkat memiliki kamera dan izin kamera telah diberikan.");
        setIsScanning(false);
      }
    } catch (err: any) {
      console.error("Error starting scanner:", err);
      setError(err.message || "Gagal memulai scanner. Pastikan izin kamera telah diberikan.");
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleQRCodeScanned = async (qrCodeValue: string) => {
    // Stop scanning immediately
    await stopScanning();

    // Validate QR code value
    if (!qrCodeValue || qrCodeValue.trim() === "") {
      setError("QR code tidak valid");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Search student by qr_code using getAllStudents with search parameter
      // The backend search includes qr_code in the search filter
      const qrCode = qrCodeValue.trim();
      const response = await studentAPI.getAllStudents({
        page: 1,
        limit: 100,
        search: qrCode,
      });
      
      if (response.success && response.data) {
        // Find exact match for qr_code (search uses ilike with %, so we need exact match)
        const students = response.data.students || [];
        const studentData = students.find(
          (student: Student) => student.qr_code === qrCode
        ) as Student | undefined;
        
        if (studentData) {
          setScannedStudent(studentData);

          // Fetch profile picture
          try {
            const mediaResponse = await mediaAPI.getMediaByModel('Student', studentData.id, 'profile-pictures');
            
            let mediaArray: any[] = [];
            if (mediaResponse.success && mediaResponse.data) {
              if (Array.isArray(mediaResponse.data)) {
                mediaArray = mediaResponse.data;
              } else if (mediaResponse.data.media && Array.isArray(mediaResponse.data.media)) {
                mediaArray = mediaResponse.data.media;
              }
            }

            if (mediaArray.length > 0) {
              const media = mediaArray[0];
              let mediaUrl = media.url;
              
              // Remove /api/v1 or /api prefix if accidentally included
              mediaUrl = mediaUrl.replace(/^\/api\/v1/, '').replace(/^\/api/, '');
              
              // Ensure it starts with /
              if (!mediaUrl.startsWith('/')) {
                mediaUrl = `/${mediaUrl}`;
              }
              
              setProfileImage(`${getBaseUrl()}${mediaUrl}`);
            } else {
              setProfileImage(null);
            }
          } catch (err) {
            console.error("Error fetching profile picture:", err);
            setProfileImage(null);
          }

          // Fetch monthly quota
          await fetchMonthlyQuota(studentData.id);
          
          // Fetch active orders (not PICKED_UP)
          await fetchActiveOrder(studentData.id);
        } else {
          setError("Siswa tidak ditemukan. Pastikan QR code valid dan siswa terdaftar.");
        }
      } else {
        setError(response.message || "Siswa tidak ditemukan. Pastikan QR code valid.");
      }
    } catch (err: any) {
      console.error("Error fetching student:", err);
      setError("Terjadi kesalahan saat mengambil data siswa. Pastikan QR code valid.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrder = () => {
    if (scannedStudent) {
      // Navigate to CreateOrder with student_id in state
      navigate("/orders/create", { state: { student_id: scannedStudent.id } });
    }
  };

  const fetchActiveOrder = async (studentId: string) => {
    try {
      const response = await orderAPI.getAllOrders({
        page: 1,
        limit: 100,
        student_id: studentId,
      });

      if (response.success && response.data) {
        const orders = response.data.orders || [];
        // Find order that is not PICKED_UP (most recent first)
        const active = orders.find(
          (order: any) => order.current_status !== "PICKED_UP"
        ) as any | undefined;

        if (active) {
          setActiveOrder({
            id: active.id,
            order_number: active.order_number,
            current_status: active.current_status,
            total_items: active.total_items,
            created_at: active.created_at,
          });
        } else {
          setActiveOrder(null);
        }
      }
    } catch (err) {
      console.error("Error fetching active order:", err);
      setActiveOrder(null);
    }
  };

  const fetchMonthlyQuota = async (studentId: string) => {
    setIsLoadingQuota(true);
    try {
      // Get current month start and end dates
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Fetch all orders for this student in current month
      let allOrders: any[] = [];
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await orderAPI.getAllOrders({
          page,
          limit,
          student_id: studentId,
        });

        if (response.success && response.data) {
          const orders = response.data.orders || [];
          
          // Filter orders created in current month
          const monthlyOrders = orders.filter((order: any) => {
            if (!order.created_at) return false;
            const orderDate = new Date(order.created_at);
            return orderDate >= monthStart && orderDate <= monthEnd;
          });

          allOrders = [...allOrders, ...monthlyOrders];

          const pagination = response.data.pagination;
          if (pagination && pagination.totalPages && page < pagination.totalPages) {
            page++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // Calculate total free items used this month
      const totalFreeItemsUsed = allOrders.reduce((sum, order) => {
        return sum + (order.free_items_used || 0);
      }, 0);

      // Monthly quota is 4 items
      const monthlyQuota = 4;
      const remaining = Math.max(0, monthlyQuota - totalFreeItemsUsed);
      setRemainingQuota(remaining);
    } catch (err) {
      console.error("Error fetching monthly quota:", err);
      setRemainingQuota(null);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  const handleScanAgain = () => {
    setScannedStudent(null);
    setProfileImage(null);
    setError(null);
    setScanError(null);
    setRemainingQuota(null);
    setActiveOrder(null);
    setStatusNotes("");
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

  const getNextStatus = (currentStatus: string): string | null => {
    const statusFlow: Record<string, string> = {
      RECEIVED: "WASHING_DRYING",
      WASHING_DRYING: "IRONING",
      IRONING: "COMPLETED",
      COMPLETED: "PICKED_UP",
      PICKED_UP: "", // Final status
    };
    return statusFlow[currentStatus] || null;
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

  const handleOpenStatusModal = () => {
    setStatusNotes("");
    setStatusImage(null);
    setStatusImagePreview(null);
    setIsStatusModalOpen(true);
  };

  const handleCloseStatusModal = () => {
    setIsStatusModalOpen(false);
    setStatusNotes("");
    setStatusImage(null);
    setStatusImagePreview(null);
  };

  const handleStatusImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setStatusImage(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setStatusImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveStatusImage = () => {
    setStatusImage(null);
    setStatusImagePreview(null);
    // Reset file input
    const fileInput = document.getElementById('status-image-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleUpdateStatus = async () => {
    if (!activeOrder) return;

    const nextStatus = getNextStatus(activeOrder.current_status);
    if (!nextStatus) return;

    setIsUpdatingStatus(true);
    setError(null);

    try {
      const response = await orderAPI.createOrderTracking(activeOrder.id, {
        status_to: nextStatus,
        notes: statusNotes.trim() || null,
      });

      if (response.success) {
        // Upload image if provided
        if (statusImage && response.data?.trackings && response.data.trackings.length > 0) {
          // Get the latest tracking (the one we just created)
          const latestTracking = response.data.trackings[response.data.trackings.length - 1];
          
          try {
            await mediaAPI.uploadMedia(
              statusImage,
              "OrderTracking",
              latestTracking.id,
              "status_update"
            );
          } catch (uploadErr: any) {
            console.error("Error uploading status image:", uploadErr);
            // Don't fail the whole operation if image upload fails
            // Just log the error
          }
        }

        handleCloseStatusModal();
        success("Status order berhasil diupdate!");
        // Reset semua state dan kembali ke mode scan
        setScannedStudent(null);
        setProfileImage(null);
        setError(null);
        setScanError(null);
        setRemainingQuota(null);
        setActiveOrder(null);
        setStatusNotes("");
        setStatusImage(null);
        setStatusImagePreview(null);
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

  const getInitials = (name: string) => {
    const words = name.trim().split(" ");
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageBreadcrumb pageTitle="Scan QR Code" />
      <PageMeta title="Scan QR Code" description="Scan QR code untuk verifikasi siswa" />

      {/* Header - Mobile Optimized */}
      {/* <div className="flex items-center gap-2 sm:gap-3 pb-2 sm:pb-0">
        <Link
          to="/orders"
          className="inline-flex items-center justify-center w-10 h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white touch-manipulation flex-shrink-0"
        >
          <AngleLeftIcon className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-xl lg:text-2xl font-semibold text-gray-800 dark:text-white truncate">
            Scan QR Code
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
            Scan QR code siswa untuk verifikasi dan membuat order
          </p>
        </div>
      </div> */}

      {/* Main Content */}
      <div className="space-y-4 sm:space-y-5">
        {/* Scanner Section */}
        {!scannedStudent && (
          <ComponentCard title="Scanner QR Code">
            <div className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
              )}

              {!isScanning && !error && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Klik tombol di bawah untuk memulai scanner
                  </p>
                  <button
                    onClick={startScanning}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors touch-manipulation"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2.01M19 8h2.01M12 12h.01M12 8h.01M12 16h.01" />
                    </svg>
                    Mulai Scan
                  </button>
                </div>
              )}

              {/* Fullscreen Scanner */}
              {isScanning && (
                <div className="fixed inset-0 z-[999999] bg-black flex flex-col items-center justify-center p-4" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
                  {/* Scanner Container */}
                  <div className="w-full max-w-md relative flex flex-col items-center">
                    <div id={scannerElementId} className="w-full rounded-lg overflow-hidden" />
                    
                    {/* Instructions */}
                    <div className="mt-4 text-center px-4">
                      <p className="text-white text-sm sm:text-base mb-2 font-medium">
                        Arahkan kamera ke QR code siswa
                      </p>
                      <p className="text-white/70 text-xs sm:text-sm">
                        Scanner akan otomatis mendeteksi QR code
                      </p>
                    </div>

                    {/* Stop Button */}
                    <button
                      onClick={stopScanning}
                      className="mt-6 w-full max-w-xs inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 active:bg-red-700 transition-colors touch-manipulation"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Hentikan Scan
                    </button>
                  </div>
                </div>
              )}

              {scanError && !isScanning && (
                <div className="p-3 text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                  {scanError}
                </div>
              )}
            </div>
          </ComponentCard>
        )}

        {/* Loading State */}
        {isLoading && (
          <ComponentCard title="Memuat Data Siswa">
            <div className="p-5">
              <TableSkeleton rows={4} columns={2} />
            </div>
          </ComponentCard>
        )}

        {/* Student Verification Section */}
        {scannedStudent && !isLoading && (
          <ComponentCard title="Verifikasi Siswa">
            <div className="space-y-4">
              {/* Profile Picture - Larger and Centered */}
              <div className="flex justify-center">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={scannedStudent.fullname}
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700 shadow-lg"
                    onError={(e) => {
                      console.error('Failed to load profile picture:', profileImage);
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-4xl sm:text-5xl border-4 border-gray-200 dark:border-gray-700 shadow-lg">
                    {getInitials(scannedStudent.fullname)}
                  </div>
                )}
              </div>

              {/* Student Name - Centered */}
              <div className="text-center">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-1">
                  {scannedStudent.fullname}
                </h3>
                <Badge size="sm" color={scannedStudent.is_active ? "success" : "error"}>
                  {scannedStudent.is_active ? "Aktif" : "Tidak Aktif"}
                </Badge>
              </div>

              {/* Quota Info - Prominent */}
              <div className="bg-gradient-to-r from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-lg p-4 border border-brand-200 dark:border-brand-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Sisa Kuota Bulan Ini
                    </p>
                    {isLoadingQuota ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
                    ) : (
                      <p className="text-2xl sm:text-3xl font-bold text-brand-600 dark:text-brand-400">
                        {remainingQuota !== null ? `${remainingQuota} pakaian` : "-"}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Kuota Total
                    </p>
                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                      4 pakaian/bulan
                    </p>
                  </div>
                </div>
              </div>

              {/* Student Details - Compact Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {scannedStudent.unique_code && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Kode Unik
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white font-mono break-all">
                      {scannedStudent.unique_code}
                    </p>
                  </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    NIK
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white break-all">
                    {scannedStudent.national_id_number}
                  </p>
                </div>

                {scannedStudent.grade_level && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Kelas
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white">
                      {scannedStudent.grade_level}
                    </p>
                  </div>
                )}

                {scannedStudent.dormitory && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Asrama
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white">
                      {scannedStudent.dormitory}
                    </p>
                  </div>
                )}
              </div>

              {/* Active Order Section */}
              {activeOrder && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                        Order Aktif
                      </p>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        {activeOrder.order_number}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Total: {activeOrder.total_items} pakaian
                      </p>
                    </div>
                    <Badge size="sm" color={getStatusColor(activeOrder.current_status)}>
                      {formatStatus(activeOrder.current_status)}
                    </Badge>
                  </div>
                  
                  {getNextStatus(activeOrder.current_status) && (
                    <button
                      onClick={handleOpenStatusModal}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors touch-manipulation"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      Lanjutkan ke {formatStatus(getNextStatus(activeOrder.current_status)!)}
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleScanAgain}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700 transition-colors touch-manipulation"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Scan Lagi
                </button>
                {!activeOrder && (
                  <button
                    onClick={handleCreateOrder}
                    disabled={!scannedStudent.is_active}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Buat Order
                  </button>
                )}
              </div>

              {!scannedStudent.is_active && (
                <div className="p-3 text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                  Siswa tidak aktif. Tidak dapat membuat order untuk siswa ini.
                </div>
              )}
            </div>
          </ComponentCard>
        )}
      </div>

      {/* Status Update Modal */}
      {activeOrder && (
        <Modal isOpen={isStatusModalOpen} onClose={handleCloseStatusModal} className="max-w-md">
          <div className="p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Update Status Order
            </h2>
            
            <div className="mb-5">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Anda akan mengubah status order{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {activeOrder.order_number}
                </span>{" "}
                dari{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatStatus(activeOrder.current_status)}
                </span>{" "}
                menjadi{" "}
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {formatStatus(getNextStatus(activeOrder.current_status)!)}
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
                className="w-full mt-2 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
            </div>

            <div className="mb-5">
              <Label>
                Foto (Opsional)
              </Label>
              <div className="mt-2 space-y-3">
                {statusImagePreview ? (
                  <div className="relative">
                    <img
                      src={statusImagePreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg border border-gray-300 dark:border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveStatusImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label
                      htmlFor="status-image-input"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Pilih dari Galeri
                    </label>
                    <label
                      htmlFor="status-image-camera"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 cursor-pointer transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Ambil dari Kamera
                    </label>
                  </div>
                )}
                <input
                  id="status-image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleStatusImageChange}
                  className="hidden"
                />
                <input
                  id="status-image-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleStatusImageChange}
                  className="hidden"
                />
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
                disabled={isUpdatingStatus}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus}
                className="px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingStatus ? "Mengupdate..." : "Konfirmasi Update"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

