import { useState, useEffect, FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { orderAPI, studentAPI } from "../../utils/api";
import { AngleLeftIcon } from "../../icons";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TableSkeleton from "../../components/common/TableSkeleton";

interface Student {
  id: string;
  fullname: string;
  national_id_number: string;
  unique_code: string | null;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStudents, setIsFetchingStudents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
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

  useEffect(() => {
    fetchStudents();
  }, []);

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 2 * 1024 * 1024; // 2MB
    const newFiles: File[] = [];
    const errors: string[] = [];

    // Validate all files first
    Array.from(files).forEach((file) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        errors.push(`File ${file.name} bukan file gambar`);
        return;
      }
      
      // Validate file size
      if (file.size > maxSize) {
        errors.push(`File ${file.name} melebihi ukuran maksimal 2MB`);
        return;
      }

      newFiles.push(file);
    });

    // Show errors if any
    if (errors.length > 0) {
      setError(errors.join(', '));
      // Still add valid files if any
      if (newFiles.length === 0) {
        e.target.value = '';
        return;
      }
    } else {
      setError(null);
    }

    // Add valid files to selected images and create previews
    if (newFiles.length > 0) {
      // Create previews for new files first
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

      // Wait for all previews to be created, then update both states
      Promise.all(previewPromises).then((previews) => {
        setSelectedImages((prev) => [...prev, ...newFiles]);
        setImagePreviews((prev) => [...prev, ...previews]);
      });
    }

    // Reset input to allow selecting the same file again
    e.target.value = '';
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
      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('student_id', formData.student_id);
      formDataToSend.append('total_items', (typeof formData.total_items === 'number' ? formData.total_items : 0).toString());
      if (formData.notes.trim()) {
        formDataToSend.append('notes', formData.notes.trim());
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
        setIsLoading(false);
        return;
      }

      // Redirect to view order page
      if (createResponse.data?.id) {
        navigate(`/orders/${createResponse.data.id}`);
      } else {
        navigate("/orders");
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
      <PageMeta title="Create Order" description="Create new order" />
      <PageBreadcrumb
        pageTitle={
          <div className="flex items-center gap-2 font-normal text-base">
            <Link
              to="/orders"
              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Orders
            </Link>
            <span className="text-gray-600">&gt;</span>
            <span>Create Order</span>
          </div>
        }
        hideBreadcrumb={true}
      />

      <div className="space-y-6">
        {/* Header with Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Create New Order
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
                  <select
                    name="student_id"
                    value={formData.student_id}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    disabled={isLoading || isFetchingStudents}
                    className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  >
                    <option value="">
                      {isFetchingStudents ? "Memuat siswa aktif..." : students.length === 0 ? "Tidak ada siswa aktif tersedia" : "Pilih Siswa Aktif"}
                    </option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.fullname || "Nama tidak tersedia"} {student.unique_code ? `(${student.unique_code})` : ""} - {student.national_id_number || "NIK tidak tersedia"}
                      </option>
                    ))}
                  </select>
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
                    disabled={isLoading}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Sistem akan menghitung otomatis: kuota gratis (4 pakaian/bulan), pakaian berbayar, dan total biaya (Rp 4.000 per pakaian berbayar)
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <Label>Catatan</Label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan catatan (opsional)"
                    disabled={isLoading}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label>Gambar (Opsional)</Label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Pilih Gambar
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          disabled={isLoading}
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
                      Format yang didukung: JPG, PNG, GIF. Maksimal 2MB per file. Anda dapat memilih lebih dari satu gambar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate("/orders")}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <AngleLeftIcon className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
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
                  {isLoading ? "Creating..." : "Create Order"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

