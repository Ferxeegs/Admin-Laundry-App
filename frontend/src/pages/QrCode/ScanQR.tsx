import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { Html5Qrcode } from "html5-qrcode";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { studentAPI, mediaAPI, orderAPI, settingAPI, qrCodeAPI, getBaseUrl } from "../../utils/api";
import { compressOrderImage } from "../../utils/compressOrderImage";
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

function resolvePublicMediaUrl(url: string): string {
  if (url.startsWith("http")) return url;
  let mediaUrl = url.replace(/^\/api\/v1/, "").replace(/^\/api/, "");
  if (!mediaUrl.startsWith("/")) mediaUrl = `/${mediaUrl}`;
  return `${getBaseUrl()}${mediaUrl}`;
}

function parseOrderMediaData(data: unknown): Array<{ url: string }> {
  if (!data) return [];
  if (typeof data === "object" && data !== null && "media" in data) {
    const m = (data as { media: unknown }).media;
    if (Array.isArray(m)) return m.filter((x): x is { url: string } => !!x && typeof x === "object" && "url" in x && typeof (x as { url: string }).url === "string");
  }
  if (Array.isArray(data)) {
    return data.filter((x): x is { url: string } => !!x && typeof x === "object" && "url" in x && typeof (x as { url: string }).url === "string");
  }
  return [];
}

export default function ScanQR() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastBagTokenRef = useRef<string | null>(null);
  const canAutoAdvanceRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{
    id: string;
    order_number: string;
    current_status: string;
    total_items: number;
    created_at: string | null;
    notes: string | null;
  } | null>(null);
  const [orderImageUrls, setOrderImageUrls] = useState<string[]>([]);
  const [orderNotesExpanded, setOrderNotesExpanded] = useState(false);
  const [orderImageLightbox, setOrderImageLightbox] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusNotes, setStatusNotes] = useState<string>("");
  const [statusImage, setStatusImage] = useState<File | null>(null);
  const [statusImagePreview, setStatusImagePreview] = useState<string | null>(null);
  const [isCompressingStatusImage, setIsCompressingStatusImage] = useState(false);
  const scannerElementId = "qr-reader";
  const { success, error: showError } = useToast();

  useEffect(() => {
    isMountedRef.current = true;
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      stopScanning();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (location.state?.autoStart) {
      // Clear location state silently so it doesn't re-trigger on reload
      window.history.replaceState({}, '');

      const initScanner = async () => {
        // Wait a small delay to let page transition finish
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        if (isCancelled) return; // Prevent strict mode double invoke from proceeding
        
        startScanning();
      };
      
      initScanner();
    }
    
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [scannedStudent?.id, profileImage]);

  const fetchOrderImages = useCallback(async (orderId: string) => {
    try {
      const res = await mediaAPI.getMediaByModel("Order", orderId, "images");
      if (!res.success || !res.data) {
        setOrderImageUrls([]);
        return;
      }
      const items = parseOrderMediaData(res.data);
      setOrderImageUrls(items.map((m) => resolvePublicMediaUrl(m.url)));
    } catch {
      setOrderImageUrls([]);
    }
  }, []);

  useEffect(() => {
    if (!activeOrder?.id) {
      setOrderImageUrls([]);
      setOrderNotesExpanded(false);
      return;
    }
    void fetchOrderImages(activeOrder.id);
  }, [activeOrder?.id, fetchOrderImages]);

  const startScanning = async () => {
    if (isStartingRef.current || scannerRef.current) return;
    isStartingRef.current = true;
    
    try {
      setError(null);
      setScanError(null);
      setScannedStudent(null);
      setProfileImage(null);
      setProfileImageFailed(false);

      // Set scanning state to show the scanner UI
      setIsScanning(true);

      // Give a tiny tick for the DOM to process the class update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const element = document.getElementById(scannerElementId);
      if (!element) {
        setError("Elemen scanner tidak ditemukan. Silakan coba lagi.");
        setIsScanning(false);
        isStartingRef.current = false;
        return;
      }

      // Create scanner instance
      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      // Get available cameras
      const devices = (await Html5Qrcode.getCameras()) as Array<{ id: string; label?: string }>;

      if (devices && devices.length > 0) {
        // Prefer back/rear camera (on many devices, devices[0] is the front camera)
        const backCamera =
          devices.find((d) => {
            const label = (d.label || "").toLowerCase();
            return (
              label.includes("back") ||
              label.includes("rear") ||
              label.includes("environment") ||
              label.includes("utama") ||
              label.includes("belakang")
            );
          }) ||
          // If labels are empty (some browsers hide labels until permission), fallback to 2nd camera.
          (devices.length > 1 ? devices[1] : devices[0]);

        const cameraId = backCamera.id;

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
            // Common errors: "No MultiFormat Readers were able to detect the code" or "No barcode or QR code detected"
            if (
              !errorMessage.includes("No QR code found") &&
              !errorMessage.includes("No MultiFormat Readers") &&
              !errorMessage.includes("NotFoundException") &&
              !errorMessage.includes("No barcode")
            ) {
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
    } finally {
      isStartingRef.current = false;
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
    setScanError(null);
  };

  const handleQRCodeScanned = async (qrCodeValue: string) => {
    await stopScanning();

    const token = qrCodeValue?.trim();
    if (!token) {
      setError("QR code tidak valid");
      return;
    }

    setIsLoading(true);
    setError(null);
    setScanError(null);

    try {
      // Auto-advance when scanning the same bag token after an active order exists.
      const shouldAutoAdvance =
        canAutoAdvanceRef.current && lastBagTokenRef.current === token;

      const qrRes = await qrCodeAPI.lookupQR(token);
      if (!qrRes.success || !qrRes.data) {
        setError(qrRes.message || "QR tas tidak ditemukan.");
        return;
      }

      const qrData = qrRes.data;

      // QR tas belum terhubung ke santri: langsung ke CreateOrder supaya petugas pilih santri.
      if (!qrData.student_id) {
        navigate("/orders/create", { state: { qr_id: qrData.id } });
        return;
      }

      // Jika ini scan ulang untuk update status
      if (shouldAutoAdvance) {
        const advRes = await qrCodeAPI.advanceTrackingByQrToken(token, { notes: null });
        if (!advRes.success) {
          setError(advRes.message || "Gagal memperbarui status (scan).");
          canAutoAdvanceRef.current = false;
          lastBagTokenRef.current = null;
          return;
        }

        success("Status order berhasil diperbarui (scan).");

        // Reload student + active order
        const studentRes = await studentAPI.getStudentById(qrData.student_id);
        if (studentRes.success && studentRes.data) {
          const s = studentRes.data as any;
          setScannedStudent({
            id: s.id,
            national_id_number: s.national_id_number ?? s.student_number ?? "",
            fullname: s.fullname,
            phone_number: s.phone_number ?? null,
            dormitory: null,
            grade_level: null,
            unique_code: null,
            guardian_name: s.guardian_name ?? null,
            qr_code: null,
            is_active: typeof s.is_active === "boolean" ? s.is_active : true,
            created_at: s.created_at ?? null,
            updated_at: s.updated_at ?? null,
          });
        }

        // Fetch profile picture (agar saat scan ulang tetap terlihat jelas)
        try {
          const sId = qrData.student_id;
          if (sId) {
            const mediaResponse = await mediaAPI.getMediaByModel(
              "Student",
              sId,
              "profile-pictures"
            );

            let mediaArray: any[] = [];
            if (mediaResponse.success && mediaResponse.data) {
              if (Array.isArray(mediaResponse.data)) {
                mediaArray = mediaResponse.data;
              } else if (
                (mediaResponse.data as any).media &&
                Array.isArray((mediaResponse.data as any).media)
              ) {
                mediaArray = (mediaResponse.data as any).media;
              }
            }

            if (mediaArray.length > 0) {
              const media = mediaArray[0];
              let mediaUrl = media.url;
              mediaUrl = mediaUrl.replace(/^\/api\/v1/, "").replace(/^\/api/, "");
              if (!mediaUrl.startsWith("/")) mediaUrl = `/${mediaUrl}`;
              setProfileImage(`${getBaseUrl()}${mediaUrl}`);
            } else {
              setProfileImage(null);
            }
          }
        } catch {
          setProfileImage(null);
        }
        setProfileImageFailed(false);
        setOrderImageUrls([]);
        setOrderNotesExpanded(false);
        setOrderImageLightbox(null);

        const hasActiveOrder = await fetchActiveOrder(qrData.student_id);
        if (!hasActiveOrder) {
          canAutoAdvanceRef.current = false;
          lastBagTokenRef.current = null;
          await fetchRemainingDailyQuota(qrData.student_id);
        } else {
          canAutoAdvanceRef.current = true;
          lastBagTokenRef.current = token;
        }
        return;
      }

      // Normal load setelah scan pertama
      lastBagTokenRef.current = token;

      const studentRes = await studentAPI.getStudentById(qrData.student_id);
      if (!studentRes.success || !studentRes.data) {
        setError(studentRes.message || "Gagal mengambil data santri.");
        return;
      }

      const s = studentRes.data as any;
      setScannedStudent({
        id: s.id,
        national_id_number: s.national_id_number ?? s.student_number ?? "",
        fullname: s.fullname,
        phone_number: s.phone_number ?? null,
        dormitory: null,
        grade_level: null,
        unique_code: null,
        guardian_name: s.guardian_name ?? null,
        qr_code: null,
        is_active: typeof s.is_active === "boolean" ? s.is_active : true,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
      });

      // Fetch profile picture
      try {
        const mediaResponse = await mediaAPI.getMediaByModel(
          "Student",
          s.id,
          "profile-pictures"
        );

        let mediaArray: any[] = [];
        if (mediaResponse.success && mediaResponse.data) {
          if (Array.isArray(mediaResponse.data)) {
            mediaArray = mediaResponse.data;
          } else if (
            (mediaResponse.data as any).media &&
            Array.isArray((mediaResponse.data as any).media)
          ) {
            mediaArray = (mediaResponse.data as any).media;
          }
        }

        if (mediaArray.length > 0) {
          const media = mediaArray[0];
          let mediaUrl = media.url;
          mediaUrl = mediaUrl.replace(/^\/api\/v1/, "").replace(/^\/api/, "");
          if (!mediaUrl.startsWith("/")) mediaUrl = `/${mediaUrl}`;
          setProfileImage(`${getBaseUrl()}${mediaUrl}`);
        } else {
          setProfileImage(null);
        }
      } catch (err) {
        console.error("Error fetching profile picture:", err);
        setProfileImage(null);
      }

      const hasActiveOrder = await fetchActiveOrder(qrData.student_id);
      canAutoAdvanceRef.current = hasActiveOrder;

      if (!hasActiveOrder) {
        await fetchRemainingDailyQuota(qrData.student_id);
      } else {
        setRemainingQuota(null);
        setQuotaLimit(null);
        setIsLoadingQuota(false);
      }
    } catch (err: any) {
      console.error("Error handling QR scan:", err);
      setError("Terjadi kesalahan saat memproses QR. Silakan coba lagi.");
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

  /** Mengembalikan true jika ada order aktif (bukan PICKED_UP). */
  const fetchActiveOrder = async (studentId: string): Promise<boolean> => {
    try {
      const response = await orderAPI.getAllOrders({
        page: 1,
        limit: 100,
        student_id: studentId,
      });

      if (response.success && response.data) {
        const orders = response.data.orders || [];
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
            notes:
              typeof active.notes === "string" && active.notes.trim() !== ""
                ? active.notes.trim()
                : null,
          });
          return true;
        }
        setActiveOrder(null);
        return false;
      }
      setActiveOrder(null);
    } catch (err) {
      console.error("Error fetching active order:", err);
      setActiveOrder(null);
    }
    return false;
  };

  const fetchRemainingDailyQuota = async (studentId: string) => {
    setIsLoadingQuota(true);
    try {
      const settingsRes = await settingAPI.getByGroup("order");
      const orderSettings = settingsRes.success ? settingsRes.data : {};
      const limit =
        typeof orderSettings?.monthly_quota === "number"
          ? orderSettings.monthly_quota
          : typeof orderSettings?.monthly_quota === "string"
            ? parseInt(orderSettings.monthly_quota, 10) || 4
            : 4;
      setQuotaLimit(limit);

      const now = new Date();
      const dayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
      );
      const dayEndExclusive = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      let allOrders: any[] = [];
      let page = 1;
      const pageLimit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await orderAPI.getAllOrders({
          page,
          limit: pageLimit,
          student_id: studentId,
        });

        if (response.success && response.data) {
          const orders = response.data.orders || [];

          const todaysOrders = orders.filter((order: any) => {
            if (!order.created_at) return false;
            const orderDate = new Date(order.created_at);
            return orderDate >= dayStart && orderDate < dayEndExclusive;
          });

          allOrders = [...allOrders, ...todaysOrders];

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

      const totalFreeItemsUsed = allOrders.reduce((sum, order) => {
        return sum + (order.free_items_used || 0);
      }, 0);

      setRemainingQuota(Math.max(0, limit - totalFreeItemsUsed));
    } catch (err) {
      console.error("Error fetching daily quota:", err);
      setRemainingQuota(null);
      setQuotaLimit(null);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  const handleScanAgain = () => {
    setScannedStudent(null);
    setProfileImage(null);
    setProfileImageFailed(false);
    setError(null);
    setScanError(null);
    setRemainingQuota(null);
    setQuotaLimit(null);
    setActiveOrder(null);
    setOrderImageUrls([]);
    setOrderNotesExpanded(false);
    setOrderImageLightbox(null);
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
    const fileInput = document.getElementById("status-image-input") as HTMLInputElement;
    const cameraInput = document.getElementById("status-image-camera") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
    if (cameraInput) cameraInput.value = "";
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
                "Gagal mengunggah foto status. Status order tetap diperbarui; silakan unggah foto dari halaman detail order jika perlu."
            );
          }
        }

        handleCloseStatusModal();
        success("Status order berhasil diupdate!");
        // Reset semua state dan kembali ke mode scan
        setScannedStudent(null);
        setProfileImage(null);
        setProfileImageFailed(false);
        setError(null);
        setScanError(null);
        setRemainingQuota(null);
        setActiveOrder(null);
        setOrderImageUrls([]);
        setOrderNotesExpanded(false);
        setOrderImageLightbox(null);
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

      {/* Keterangan halaman (hanya tampil saat belum scan) */}
      {!scannedStudent && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 sm:text-base">
            Tentang Scan QR Code
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Halaman ini digunakan untuk memindai QR code siswa saat penyerahan atau pengambilan laundry.
            Setelah QR code terdeteksi, sistem akan menampilkan data siswa, sisa kuota gratis hari ini,
            dan order aktif (jika ada). Anda dapat membuat order baru atau mengubah status order
            (Diterima → Cuci & Kering → Setrika → Selesai → Diambil).
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <span>Pastikan izin kamera sudah diberikan agar scanner dapat digunakan.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <span>Arahkan kamera ke QR code siswa dengan jarak dan pencahayaan yang cukup.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <span>Gunakan tombol &quot;Scan Lagi&quot; untuk memindai siswa lain setelah selesai.</span>
            </li>
          </ul>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-4 sm:space-y-5">
        {/* Scanner Section */}
        {!scannedStudent && (
          <ComponentCard title="Scanner QR Code">
            <div className="space-y-5">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
              )}

              {!isScanning && !error && (
                <>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Klik tombol <strong>Mulai Scan</strong> di bawah untuk mengaktifkan kamera.
                      Setelah scanner terbuka, arahkan kamera ke QR code yang terdapat pada kartu atau
                      dokumen siswa. Pemindaian akan berhenti otomatis ketika QR code berhasil terbaca.
                    </p>
                  </div>
                  <div className="text-center py-4">
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
                </>
              )}

              {/* Fullscreen Scanner */}
              <div 
                className={`fixed inset-0 z-[999999] bg-black flex flex-col items-center justify-center p-4 transition-all duration-200 ${isScanning ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'}`} 
                style={{ top: 0, left: 0, right: 0, bottom: 0 }}
              >
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

        {/* Student Verification — compact on mobile, order photos + notes */}
        {scannedStudent && !isLoading && (
          <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
            <ComponentCard title="Hasil scan">
              <div className="space-y-2.5 sm:space-y-4 md:space-y-5">
                {/* Identitas siswa — foto besar untuk verifikasi */}
                <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gradient-to-b from-slate-50 via-white to-gray-50/80 shadow-sm dark:border-gray-700/90 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950/90 sm:rounded-2xl">
                  <div
                    className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-500/[0.07] blur-2xl dark:bg-brand-400/[0.12] sm:-right-16 sm:-top-16 sm:h-48 sm:w-48 sm:blur-3xl"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute -bottom-14 -left-12 h-44 w-44 rounded-full bg-brand-400/[0.06] blur-2xl dark:bg-brand-500/[0.08] sm:-bottom-20 sm:-left-16 sm:h-56 sm:w-56 sm:blur-3xl"
                    aria-hidden
                  />
                  <div className="relative px-3 pb-4 pt-3.5 text-center sm:px-8 sm:pb-8 sm:pt-7">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 sm:text-[11px] sm:tracking-[0.22em]">
                      Verifikasi identitas
                    </p>
                    <div className="mx-auto mt-2.5 flex max-w-[min(100%,20rem)] justify-center sm:mt-5">
                      <div className="relative">
                        <div
                          className="absolute inset-0 scale-[1.08] rounded-full bg-gradient-to-br from-brand-400/25 via-transparent to-brand-600/10 blur-lg dark:from-brand-400/20 dark:to-brand-500/15 sm:blur-xl"
                          aria-hidden
                        />
                        <div className="relative rounded-full bg-gradient-to-br from-white via-gray-50 to-gray-100 p-[2px] shadow-[0_8px_28px_-10px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.04] dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 dark:ring-white/[0.06] sm:p-1 sm:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
                          <div className="overflow-hidden rounded-full ring-2 ring-white dark:ring-gray-950 sm:ring-[3px] md:ring-4">
                            {profileImage && !profileImageFailed ? (
                              <img
                                src={profileImage}
                                alt={scannedStudent.fullname}
                                className="aspect-square h-32 w-32 object-cover sm:h-44 sm:w-44 md:h-48 md:w-48"
                                onError={() => setProfileImageFailed(true)}
                              />
                            ) : (
                              <div className="flex aspect-square h-32 w-32 items-center justify-center bg-gradient-to-br from-brand-500 to-brand-600 text-3xl font-semibold tracking-tight text-white shadow-inner sm:h-44 sm:w-44 sm:text-5xl md:h-48 md:w-48 md:text-6xl">
                                {getInitials(scannedStudent.fullname)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <h3 className="mx-auto mt-3 max-w-lg px-0.5 text-lg font-semibold leading-snug tracking-tight text-gray-900 dark:text-white sm:mt-6 sm:px-1 sm:text-2xl md:text-[1.65rem]">
                      {scannedStudent.fullname}
                    </h3>
                    <div className="mt-2 flex justify-center sm:mt-3.5">
                      <Badge size="sm" color={scannedStudent.is_active ? "success" : "error"}>
                        {scannedStudent.is_active ? "Aktif" : "Tidak Aktif"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Kuota hanya jika belum ada order aktif (alur buat order baru) */}
                {!activeOrder && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200/70 bg-gradient-to-r from-brand-50/95 to-brand-100/60 px-3 py-2 shadow-sm dark:border-brand-800/50 dark:from-brand-900/30 dark:to-brand-800/20 sm:rounded-xl sm:px-5 sm:py-3.5">
                    <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 sm:text-sm">
                      Kuota hari ini
                    </span>
                    {isLoadingQuota ? (
                      <span className="text-sm text-gray-500">Memuat…</span>
                    ) : (
                      <span className="text-right">
                        <span className="text-lg font-bold tabular-nums text-brand-600 dark:text-brand-400 sm:text-xl">
                          {remainingQuota !== null ? remainingQuota : "—"}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                          {" "}
                          / {quotaLimit !== null ? quotaLimit : "—"} pakaian
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Kode unik + NIS — satu baris, ringkas di mobile */}
                <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-gray-200/80 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-900/50 sm:rounded-xl">
                  {scannedStudent.unique_code ? (
                    <>
                      <div className="min-w-0 border-r border-gray-100 p-2 dark:border-gray-700/80 sm:p-3">
                        <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-[10px]">
                          Kode unik
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[11px] font-semibold leading-tight text-gray-900 dark:text-white sm:text-xs md:text-sm">
                          {scannedStudent.unique_code}
                        </p>
                      </div>
                      <div className="min-w-0 p-2 sm:p-3">
                        <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-[10px]">
                          NIS
                        </p>
                        <p className="mt-0.5 break-all text-[11px] font-semibold leading-tight text-gray-900 dark:text-white sm:text-xs md:text-sm">
                          {scannedStudent.national_id_number}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 min-w-0 p-2 sm:p-3">
                      <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-[10px]">
                        NIS
                      </p>
                      <p className="mt-0.5 break-all text-[11px] font-semibold leading-tight text-gray-900 dark:text-white sm:text-xs md:text-sm">
                        {scannedStudent.national_id_number}
                      </p>
                    </div>
                  )}
                </div>

                {/* Order aktif: foto order + catatan dari tabel orders */}
                {activeOrder && (
                  <div className="overflow-hidden rounded-lg border border-blue-200/90 bg-blue-50/50 dark:border-blue-800/70 dark:bg-blue-950/25 sm:rounded-xl">
                    <div className="flex items-start justify-between gap-2 border-b border-blue-200/60 px-2.5 py-2 dark:border-blue-800/50 sm:px-4 sm:py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                          Order aktif
                        </p>
                        <p className="truncate font-mono text-sm font-semibold text-blue-950 dark:text-blue-50">
                          {activeOrder.order_number}
                        </p>
                        <p className="text-xs text-blue-700/90 dark:text-blue-300/90">
                          {activeOrder.total_items} pakaian
                        </p>
                      </div>
                      <Badge size="sm" color={getStatusColor(activeOrder.current_status)}>
                        {formatStatus(activeOrder.current_status)}
                      </Badge>
                    </div>

                    {orderImageUrls.length > 0 && (
                      <div className="border-b border-blue-200/40 px-1.5 py-1.5 dark:border-blue-800/40 sm:px-2 sm:py-2">
                        <p className="mb-1 px-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-800/80 dark:text-blue-300/80 sm:px-1 sm:text-[10px]">
                          Foto order
                        </p>
                        <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2 sm:pb-1">
                          {orderImageUrls.map((url, idx) => (
                            <button
                              key={`${url}-${idx}`}
                              type="button"
                              onClick={() => setOrderImageLightbox(url)}
                              className="h-[4.5rem] w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-md border border-blue-200/80 bg-white shadow-sm ring-offset-2 transition hover:ring-2 hover:ring-blue-400 dark:border-blue-700 dark:bg-gray-900 sm:h-24 sm:w-24 sm:rounded-lg"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeOrder.notes && (
                      <div className="px-2.5 py-2 sm:px-4 sm:py-3">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-800/80 dark:text-blue-300/80 sm:text-[10px]">
                          Catatan order
                        </p>
                        <p
                          className={`mt-0.5 whitespace-pre-wrap text-xs leading-snug text-blue-950/90 dark:text-blue-50/90 sm:mt-1 sm:text-sm ${
                            orderNotesExpanded ? "" : "line-clamp-3"
                          }`}
                        >
                          {activeOrder.notes}
                        </p>
                        {activeOrder.notes.length > 90 && (
                          <button
                            type="button"
                            onClick={() => setOrderNotesExpanded((e) => !e)}
                            className="mt-1 text-xs font-medium text-blue-700 underline decoration-blue-400/60 underline-offset-2 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                          >
                            {orderNotesExpanded ? "Ringkas" : "Selengkapnya"}
                          </button>
                        )}
                      </div>
                    )}

                    {!activeOrder.notes && orderImageUrls.length === 0 && (
                      <p className="px-2.5 py-1.5 text-[11px] text-blue-800/70 dark:text-blue-300/70 sm:px-4 sm:py-2 sm:text-xs">
                        Belum ada foto atau catatan pada order ini.
                      </p>
                    )}

                    {getNextStatus(activeOrder.current_status) && (
                      <div className="border-t border-blue-200/50 p-1.5 dark:border-blue-800/50 sm:p-3">
                        <button
                          type="button"
                          onClick={handleOpenStatusModal}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 active:bg-blue-800 touch-manipulation sm:gap-2 sm:rounded-lg sm:px-3 sm:py-2.5 sm:text-sm"
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="truncate">
                            Lanjut ke {formatStatus(getNextStatus(activeOrder.current_status)!)}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!scannedStudent.is_active && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 sm:p-2.5 sm:text-sm">
                    Siswa tidak aktif — tidak dapat membuat order baru.
                  </div>
                )}

                {/* --- EMPTY STATE NO ACTIVE ORDER --- */}
                {!activeOrder && scannedStudent.is_active && (
                  <div className="flex flex-col items-center justify-center p-5 mt-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 dark:border-brand-800/50 dark:bg-brand-900/10">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100/80 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                    <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 sm:text-sm">Tidak Ada Order Aktif</p>
                    <p className="mt-1 mb-4 text-center text-xs text-gray-500 dark:text-gray-400 sm:text-[13px]">
                      Siswa ini belum memiliki cucian yang sedang diproses. Silakan buat pesanan baru.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateOrder}
                      className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 transition-colors touch-manipulation"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Buat Pesanan Laundry
                    </button>
                  </div>
                )}

                {/* Aksi General (Selalu Tampil) */}
                <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-3 dark:border-gray-700 md:flex-row md:items-center md:justify-end md:gap-3 md:pt-4">
                  <button
                    type="button"
                    onClick={handleScanAgain}
                    className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 touch-manipulation"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan Siswa Lain
                  </button>
                  {activeOrder && (
                     <button
                        type="button"
                        onClick={handleCreateOrder}
                        disabled={!scannedStudent.is_active}
                        className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                      >
                       <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                       </svg>
                       Buat Order Lain
                     </button>
                  )}
                </div>
              </div>
            </ComponentCard>


          </div>
        )}
      </div>

      {/* Lightbox foto order (hasil scan) */}
      <Modal
        isOpen={!!orderImageLightbox}
        onClose={() => setOrderImageLightbox(null)}
        className="max-w-2xl"
      >
        <div className="p-3 sm:p-5">
          {orderImageLightbox && (
            <img
              src={orderImageLightbox}
              alt="Foto order"
              className="mx-auto max-h-[min(85vh,720px)] w-full rounded-xl object-contain"
            />
          )}
        </div>
      </Modal>

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
                disabled={isUpdatingStatus || isCompressingStatusImage}
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
                      disabled={isUpdatingStatus || isCompressingStatusImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    {isCompressingStatusImage && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Memampatkan gambar…
                      </p>
                    )}
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
                  </>
                )}
                <input
                  id="status-image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleStatusImageChange}
                  disabled={isUpdatingStatus || isCompressingStatusImage}
                  className="hidden"
                />
                <input
                  id="status-image-camera"
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
      )}
    </div>
  );
}

