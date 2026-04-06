import { useState, useEffect, FormEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { orderAPI, studentAPI, qrCodeAPI, addonAPI } from "../../utils/api";
import { compressOrderImage } from "../../utils/compressOrderImage";
import { AngleLeftIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TableSkeleton from "../../components/common/TableSkeleton";
import SearchableSelect from "../../components/form/SearchableSelect";

interface CatalogAddon {
  id: string;
  name: string;
  price: number;
  description: string | null;
}

interface Student {
  id: string;
  fullname: string;
  student_number: string;
  unique_code?: string | null;
  // Backward compat: beberapa versi frontend/backend memakai nama field berbeda
  national_id_number?: string | null;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStudents, setIsFetchingStudents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrIdToAssign, setQrIdToAssign] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<{
    student_id: string;
    total_items: number | "";
    notes: string;
  }>({
    student_id: "",
    total_items: 4,
    notes: "",
  });
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [catalogAddons, setCatalogAddons] = useState<CatalogAddon[]>([]);
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Check if student_id is passed from navigation state (e.g., from ScanQR)
    const state = location.state as { student_id?: string; qr_id?: string } | null;
    if (state?.student_id && typeof state.student_id === 'string') {
      setFormData((prev) => ({
        ...prev,
        student_id: state.student_id as string,
      }));
    }
    if (state?.qr_id && typeof state.qr_id === "string") {
      setQrIdToAssign(state.qr_id);
    }
    fetchStudents();
    void fetchCatalogAddons();
  }, [location.state]);

  const fetchCatalogAddons = async () => {
    try {
      const res = await addonAPI.listAddons({ limit: 200, active_only: true });
      if (res.success && res.data?.addons) {
        setCatalogAddons(
          res.data.addons.map((a) => ({
            id: a.id,
            name: a.name,
            price: Number(a.price),
            description: a.description,
          })),
        );
      }
    } catch {
      setCatalogAddons([]);
    }
  };

  const setAddonQuantity = (addonId: string, qty: number) => {
    setAddonCounts((prev) => {
      const next = { ...prev };
      if (qty < 1) delete next[addonId];
      else next[addonId] = qty;
      return next;
    });
  };

  const fetchStudents = async () => {
    setIsFetchingStudents(true);
    setError(null);
    try {
      // Fetch all active students using pagination
      // Backend limit max is 100, so we need to fetch multiple pages if needed
      let allStudents: Student[] = [];
      let page = 1;
      const limit = 100; // Max allowed by backend
      let hasMore = true;

      while (hasMore) {
        const response = await studentAPI.getAllStudents({
          page,
          limit,
          is_active: true, // Only fetch active students
        });

        if (response.success && response.data) {
          const studentsList = response.data.students || [];
          allStudents = [...allStudents, ...studentsList];

          // Check if there are more pages
          const pagination = response.data.pagination;
          if (pagination && pagination.totalPages && page < pagination.totalPages) {
            page++;
          } else {
            hasMore = false;
          }
        } else {
          console.error("Failed to fetch students:", response.message);
          setError("Gagal mengambil daftar siswa. Silakan coba lagi.");
          hasMore = false;
        }
      }

      setStudents(allStudents);

      if (allStudents.length === 0) {
        console.warn("No active students found");
        setError("Tidak ada siswa aktif yang tersedia. Silakan tambahkan siswa terlebih dahulu.");
      }
    } catch (err: any) {
      console.error("Fetch students error:", err);
      setError("Terjadi kesalahan saat mengambil daftar siswa. Silakan coba lagi.");
    } finally {
      setIsFetchingStudents(false);
    }
  };

  const handleFormChange = (name: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTotalItemsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string so user can delete the value
    if (value === "") {
      setFormData((prev) => ({
        ...prev,
        total_items: "" as unknown as number, // Temporarily allow empty string for deletion
      }));
    } else {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setFormData((prev) => ({
          ...prev,
          total_items: numValue,
        }));
      }
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const rawInputs = Array.from(files);
    const errors: string[] = [];
    const toCompress: File[] = [];

    for (const file of rawInputs) {
      if (!file.type.startsWith("image/")) {
        errors.push(`File ${file.name} bukan file gambar`);
        continue;
      }
      toCompress.push(file);
    }

    if (errors.length > 0) {
      setError(errors.join(", "));
      if (toCompress.length === 0) {
        e.target.value = "";
        return;
      }
    } else {
      setError(null);
    }

    setIsCompressingImages(true);
    const newFiles: File[] = [];
    const compressErrors: string[] = [];

    // Kompresi di klien (resize + WebP) sebelum upload; tidak mengirim file kamera mentah
    for (const file of toCompress) {
      try {
        newFiles.push(await compressOrderImage(file));
      } catch {
        compressErrors.push(file.name);
      }
    }

    setIsCompressingImages(false);

    if (compressErrors.length > 0) {
      showError(
        `Gagal memproses gambar: ${compressErrors.join(", ")}. Coba lagi atau pilih gambar lain.`
      );
    }

    if (newFiles.length === 0) {
      e.target.value = "";
      return;
    }

    const previewPromises = newFiles.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            file,
            preview: reader.result as string,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    const previews = await Promise.all(previewPromises);
    setSelectedImages((prev) => [...prev, ...newFiles]);
    setImagePreviews((prev) => [...prev, ...previews]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    // Find the file from preview to remove from selectedImages
    const fileToRemove = imagePreviews[index]?.file;
    
    // Remove from selectedImages by matching the file reference
    setSelectedImages((prev) => {
      if (fileToRemove) {
        return prev.filter((file) => file !== fileToRemove);
      }
      return prev.filter((_, i) => i !== index);
    });
    
    // Remove from previews
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!formData.student_id.trim()) {
      setError("Siswa wajib dipilih");
      return;
    }

    if (typeof formData.total_items !== 'number' || formData.total_items <= 0) {
      setError("Jumlah pakaian harus lebih dari 0");
      return;
    }

    setIsLoading(true);

    try {
      // If arriving from ScanQR, ensure QR is assigned to selected student
      if (qrIdToAssign) {
        const assignRes = await qrCodeAPI.assignQR(qrIdToAssign, formData.student_id);
        if (!assignRes.success) {
          const msg = assignRes.message || assignRes.error || "Gagal mengaitkan QR ke siswa";
          setError(msg);
          showError(msg);
          setIsLoading(false);
          return;
        }
      }

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('student_id', formData.student_id);
      formDataToSend.append('total_items', (typeof formData.total_items === 'number' ? formData.total_items : 0).toString());
      if (formData.notes.trim()) {
        formDataToSend.append('notes', formData.notes.trim());
      }
      const addonLines = Object.entries(addonCounts)
        .filter(([, c]) => c > 0)
        .map(([addon_id, count]) => ({ addon_id, count }));
      if (addonLines.length > 0) {
        formDataToSend.append("addon_lines", JSON.stringify(addonLines));
      }
      // Append all images (only if there are images)
      if (selectedImages.length > 0) {
        selectedImages.forEach((image) => {
          formDataToSend.append('images', image);
        });
      }

      const createResponse = await orderAPI.createOrder(formDataToSend);

      if (!createResponse.success) {
        // Handle error message - ensure it's always a string
        let errorMessage = "Gagal membuat order";
        
        if (createResponse.message) {
          if (typeof createResponse.message === 'string') {
            errorMessage = createResponse.message;
          } else if (Array.isArray(createResponse.message)) {
            errorMessage = createResponse.message.map((msg: any) => 
              typeof msg === 'string' ? msg : JSON.stringify(msg)
            ).join(', ');
          } else {
            errorMessage = JSON.stringify(createResponse.message);
          }
        } else if (createResponse.error) {
          if (typeof createResponse.error === 'string') {
            errorMessage = createResponse.error;
          } else if (Array.isArray(createResponse.error)) {
            errorMessage = createResponse.error.map((err: any) => 
              typeof err === 'string' ? err : JSON.stringify(err)
            ).join(', ');
          } else {
            errorMessage = JSON.stringify(createResponse.error);
          }
        }
        
        setError(errorMessage);
        showError(errorMessage);
        setIsLoading(false);
        return;
      }

      success("Order berhasil dibuat!");

      const created = createResponse.data as
        | { id?: string; images_queued?: number }
        | undefined;
      if (selectedImages.length > 0 && (created?.images_queued ?? 0) === 0) {
        showError(
          "Gagal mengunggah gambar pesanan. Order tetap dibuat; tambahkan gambar lewat edit pesanan jika perlu."
        );
      }

      setIsLoading(false);
      if (createResponse.data?.id) {
        setTimeout(() => {
          navigate(`/orders/${createResponse.data.id}`);
        }, 500);
      } else {
        setTimeout(() => {
          navigate("/orders");
        }, 500);
      }
    } catch (err: any) {
      console.error("Create order error:", err);
      let errorMessage = "Terjadi kesalahan saat membuat order";
      
      if (err?.response?.data) {
        const errorData = err.response.data;
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map((e: any) => 
              typeof e === 'object' && e.msg ? `${e.loc?.join('.')}: ${e.msg}` : String(e)
            ).join(', ');
          } else {
            errorMessage = errorData.detail;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      showError(errorMessage);
      setIsLoading(false);
    }
  };

  if (isFetchingStudents) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Create Order" />
        <PageMeta title="Create Order" description="Create new order" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={10} columns={2} />
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Tambah Pesanan" description="Tambahkan pesanan baru" />
      <PageBreadcrumb
        pageTitle={
          <div className="flex items-center gap-2 font-normal text-base">
            <Link
              to="/orders"
              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Pesanan
            </Link>
            <span className="text-gray-600">&gt;</span>
            <span>Tambah Pesanan</span>
          </div>
        }
        hideBreadcrumb={true}
      />

      <div className="space-y-4 sm:space-y-6">
        {/* Header - Mobile Optimized */}
        <div className="flex items-center gap-2 sm:gap-3 pb-2 sm:pb-0">
          <Link
            to="/orders"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white touch-manipulation flex-shrink-0"
          >
            <AngleLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white flex-1">
            Tambah Pesanan
          </h1>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 p-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>
                    Siswa <span className="text-error-500">*</span>
                  </Label>
                  <SearchableSelect
                    options={students.map((student) => ({
                      id: student.id,
                      label: student.fullname || "Nama tidak tersedia",
                      sublabel: `${student.student_number || student.national_id_number || "NIS tidak tersedia"}${student.unique_code ? ` (${student.unique_code})` : ""}`,
                    }))}
                    value={formData.student_id}
                    onChange={(value) => handleFormChange("student_id", value)}
                    placeholder={isFetchingStudents ? "Memuat siswa aktif..." : students.length === 0 ? "Tidak ada siswa aktif tersedia" : "Cari dan Pilih Siswa"}
                    disabled={isLoading || isFetchingStudents || isCompressingImages}
                    isLoading={isFetchingStudents}
                  />
                  {students.length === 0 && !isFetchingStudents && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      Tidak ada siswa aktif ditemukan. Pastikan ada siswa yang terdaftar dan status aktif.
                    </p>
                  )}
                  {students.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Menampilkan {students.length} siswa aktif
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <Label>
                    Jumlah Pakaian <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    name="total_items"
                    value={typeof formData.total_items === 'number' ? formData.total_items : ""}
                    onChange={handleTotalItemsChange}
                    placeholder="Masukkan jumlah pakaian"
                    min="1"
                    disabled={isLoading || isCompressingImages}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Sistem akan menghitung otomatis: kuota gratis cuci per minggu, pakaian di luar kuota berbayar sesuai harga per item, dan layanan tambahan (addon) dihitung terpisah tanpa memakai kuota
                  </p>
                </div>

                {catalogAddons.length > 0 && (
                  <div className="sm:col-span-2">
                    <Label>Layanan tambahan (opsional)</Label>
                    <div className="mt-2 space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                      {catalogAddons.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-white">{a.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Rp {a.price.toLocaleString("id-ID")}
                              {a.description ? ` · ${a.description}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setAddonQuantity(a.id, Math.max(0, (addonCounts[a.id] ?? 0) - 1))
                              }
                              disabled={isLoading || isCompressingImages || !(addonCounts[a.id] ?? 0)}
                              className="w-9 h-9 rounded-lg border border-gray-300 text-lg leading-none hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800"
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-medium tabular-nums">
                              {addonCounts[a.id] ?? 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAddonQuantity(a.id, (addonCounts[a.id] ?? 0) + 1)}
                              disabled={isLoading || isCompressingImages}
                              className="w-9 h-9 rounded-lg border border-gray-300 text-lg leading-none hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Harga disimpan sesuai master data saat pesanan dibuat.
                    </p>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <Label>Catatan</Label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan catatan (opsional)"
                    disabled={isLoading || isCompressingImages}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label>Gambar (Opsional)</Label>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Ambil Foto dari Kamera */}
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 border border-brand-500 rounded-lg hover:bg-brand-600 cursor-pointer transition-colors dark:bg-brand-600 dark:border-brand-600 dark:hover:bg-brand-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Ambil Foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleImageChange}
                          disabled={isLoading || isCompressingImages}
                          className="hidden"
                        />
                      </label>
                      {isCompressingImages && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Memproses gambar…
                        </span>
                      )}
                      
                      {/* Pilih dari Galeri */}
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Pilih dari Galeri
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          disabled={isLoading || isCompressingImages}
                          className="hidden"
                        />
                      </label>
                      
                      {selectedImages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImages([]);
                            setImagePreviews([]);
                          }}
                          className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
                        >
                          Hapus Semua
                        </button>
                      )}
                    </div>
                    {imagePreviews.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                        {imagePreviews.map((item, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={item.preview}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              title="Hapus gambar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-xs rounded">
                              {item.file.name.length > 15 ? `${item.file.name.substring(0, 15)}...` : item.file.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Foto akan otomatis diperkecil (maks. lebar/tinggi 1024px) dan dikompres ke WebP sebelum diunggah agar lebih cepat. Anda dapat memilih lebih dari satu gambar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate("/orders")}
                  disabled={isLoading || isCompressingImages}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <AngleLeftIcon className="w-4 h-4" />
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isLoading || isCompressingImages}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-4 h-4"
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
                  {isLoading ? "Membuat..." : isCompressingImages ? "Memampatkan gambar…" : "Tambah Pesanan"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

