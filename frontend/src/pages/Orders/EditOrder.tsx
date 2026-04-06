import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { orderAPI, mediaAPI, addonAPI, getBaseUrl } from "../../utils/api";
import { compressOrderImage } from "../../utils/compressOrderImage";
import { AngleLeftIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TableSkeleton from "../../components/common/TableSkeleton";

interface CatalogAddon {
  id: string;
  name: string;
  price: number;
  description: string | null;
}

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [formData, setFormData] = useState({
    total_items: 0,
    notes: "",
  });
  const [images, setImages] = useState<Array<{ id: number; url: string; file_name: string }>>([]);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [catalogAddons, setCatalogAddons] = useState<CatalogAddon[]>([]);
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});
  const { error: showErrorToast } = useToast();

  const canEditOrder = (status: string): boolean => {
    return status === "RECEIVED";
  };

  useEffect(() => {
    if (id) {
      fetchOrderData();
    }
    void fetchCatalogAddons();
  }, [id]);

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

  const fetchOrderImages = async (orderId: string) => {
    try {
      const response = await mediaAPI.getMediaByModel('Order', orderId, 'images');
      if (response.success && response.data) {
        // Response structure: { media: Array<...> }
        let mediaArray: Array<{ id: number; url: string; file_name: string }> = [];
        if (response.data.media && Array.isArray(response.data.media)) {
          mediaArray = response.data.media;
        } else if (Array.isArray(response.data)) {
          mediaArray = response.data;
        }
        setImages(mediaArray);
      }
    } catch (err) {
      console.error("Fetch order images error:", err);
    }
  };

  const fetchOrderData = async () => {
    if (!id) return;

    setIsFetching(true);
    setError(null);

    try {
      const response = await orderAPI.getOrderById(id);
      if (response.success && response.data) {
        const order = response.data;
        setOrderStatus(order.current_status || "");
        setFormData({
          total_items: order.total_items || 0,
          notes: order.notes || "",
        });
        const ac: Record<string, number> = {};
        for (const row of order.addons ?? []) {
          ac[row.addon_id] = (ac[row.addon_id] ?? 0) + row.count;
        }
        setAddonCounts(ac);

        // Check if order can be edited
        if (!canEditOrder(order.current_status || "")) {
          setError("Order dengan status ini tidak dapat diubah. Hanya order dengan status 'Diterima' yang dapat diubah.");
        }

        // Fetch order images
        await fetchOrderImages(id);
      } else {
        setError(response.message || "Gagal mengambil data order");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch order error:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleFormChange = (name: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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

    for (const file of toCompress) {
      try {
        newFiles.push(await compressOrderImage(file));
      } catch {
        compressErrors.push(file.name);
      }
    }

    setIsCompressingImages(false);

    if (compressErrors.length > 0) {
      showErrorToast(
        `Gagal memproses gambar: ${compressErrors.join(", ")}. Coba lagi atau pilih gambar lain.`
      );
    }

    if (newFiles.length === 0) {
      e.target.value = "";
      return;
    }

    const previewEntries: Array<{ file: File; preview: string }> = [];
    for (const file of newFiles) {
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      previewEntries.push({ file, preview });
    }

    setSelectedImages((prev) => [...prev, ...newFiles]);
    setImagePreviews((prev) => [...prev, ...previewEntries]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    const fileToRemove = imagePreviews[index]?.file;
    
    setSelectedImages((prev) => {
      if (fileToRemove) {
        return prev.filter((file) => file !== fileToRemove);
      }
      return prev.filter((_, i) => i !== index);
    });
    
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = async (imageId: number) => {
    if (!id) return;
    
    try {
      const response = await mediaAPI.deleteMedia(imageId);
      if (response.success) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      } else {
        setError(response.message || "Gagal menghapus gambar");
      }
    } catch (err) {
      console.error("Delete image error:", err);
      setError("Terjadi kesalahan saat menghapus gambar");
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id) return;

    setError(null);

    // Client-side validation
    if (formData.total_items <= 0) {
      setError("Jumlah pakaian harus lebih dari 0");
      return;
    }

    setIsLoading(true);

    try {
      const payload: {
        total_items: number;
        notes: string | null;
        addon_lines?: Array<{ addon_id: string; count: number }>;
      } = {
        total_items: formData.total_items,
        notes: formData.notes.trim() || null,
      };
      if (canEditOrder(orderStatus)) {
        payload.addon_lines = Object.entries(addonCounts)
          .filter(([, c]) => c > 0)
          .map(([addon_id, count]) => ({ addon_id, count }));
      }

      const updateResponse = await orderAPI.updateOrder(id, payload);

      if (!updateResponse.success) {
        setError(updateResponse.message || "Gagal mengupdate order");
        setIsLoading(false);
        return;
      }

      if (selectedImages.length > 0 && id) {
        setIsUploadingImages(true);
        try {
          const results = await Promise.all(
            selectedImages.map((file) =>
              mediaAPI.uploadMedia(file, "Order", id, "images")
            )
          );
          const failed = results.filter((r) => !r.success);
          if (failed.length > 0) {
            const detail =
              failed.length === selectedImages.length
                ? failed[0].message || "Gagal mengunggah gambar. Silakan coba lagi."
                : `${failed.length} dari ${selectedImages.length} gambar gagal diunggah.`;
            showErrorToast(detail);
          }
        } catch (uploadErr) {
          console.error("Upload images error:", uploadErr);
          showErrorToast("Gagal mengunggah gambar. Silakan coba lagi.");
        } finally {
          setIsUploadingImages(false);
        }
      }

      setIsLoading(false);
      navigate(`/orders/${id}`);
    } catch (err: any) {
      setError("Terjadi kesalahan saat mengupdate order");
      console.error("Update order error:", err);
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Edit Pesanan" />
        <PageMeta title="Edit Pesanan" description="Edit informasi pesanan" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={10} columns={2} />
        </div>
      </div>
    );
  }

  if (error && !formData.total_items) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Edit Pesanan" />
        <PageMeta title="Edit Pesanan" description="Edit informasi pesanan" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => navigate("/orders")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
            >
              Kembali ke Daftar Pesanan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Edit Pesanan" description="Edit informasi pesanan" />
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
            <Link
              to={`/orders/${id}`}
              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Lihat Pesanan
            </Link>
            <span className="text-gray-600">&gt;</span>
            <span>Edit Pesanan</span>
          </div>
        }
        hideBreadcrumb={true}
      />

      <div className="space-y-6">
        {/* Header with Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Edit Pesanan
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

              {!canEditOrder(orderStatus) && (
                <div className="p-3 text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                  Order dengan status ini tidak dapat diubah jumlah pakaiannya. Hanya catatan yang dapat diubah.
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>
                    Jumlah Pakaian <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    name="total_items"
                    value={formData.total_items}
                    onChange={(e) => handleFormChange(e.target.name, parseInt(e.target.value) || 0)}
                    placeholder="Masukkan jumlah pakaian"
                    min="1"
                    disabled={isLoading || isCompressingImages || !canEditOrder(orderStatus)}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Sistem akan menghitung otomatis: kuota gratis cuci per minggu, pakaian di luar kuota berbayar sesuai harga per item, dan layanan tambahan (addon) dihitung terpisah tanpa memakai kuota
                  </p>
                  {!canEditOrder(orderStatus) && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      Field ini dinonaktifkan karena order sudah dalam proses cuci/kering atau lebih lanjut.
                    </p>
                  )}
                </div>

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

                {catalogAddons.length > 0 && (
                  <div className="sm:col-span-2">
                    <Label>Layanan tambahan</Label>
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
                              disabled={
                                isLoading ||
                                isCompressingImages ||
                                !canEditOrder(orderStatus) ||
                                !(addonCounts[a.id] ?? 0)
                              }
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
                              disabled={
                                isLoading || isCompressingImages || !canEditOrder(orderStatus)
                              }
                              className="w-9 h-9 rounded-lg border border-gray-300 text-lg leading-none hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {!canEditOrder(orderStatus) && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        Addon hanya dapat diubah saat status DITERIMA.
                      </p>
                    )}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <Label>Gambar Pesanan</Label>
                  <div className="space-y-3 mt-2">
                    {/* Existing Images */}
                    {images.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {images.map((image) => {
                          const imageUrl = image.url.startsWith('http') 
                            ? image.url 
                            : `${getBaseUrl()}${image.url.startsWith('/') ? image.url : `/${image.url}`}`;
                          
                          return (
                            <div key={image.id} className="relative group">
                              <img
                                src={imageUrl}
                                alt={image.file_name}
                                className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                              />
                              <button
                                type="button"
                                onClick={() => removeExistingImage(image.id)}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                title="Hapus gambar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add New Images */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Tambah Gambar
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          disabled={isLoading || isUploadingImages || isCompressingImages}
                          className="hidden"
                        />
                      </label>
                      {isCompressingImages && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Memampatkan gambar…
                        </span>
                      )}
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

                    {/* Preview New Images */}
                    {imagePreviews.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Foto akan otomatis diperkecil (maks. lebar/tinggi 1024px) dan dikompres ke WebP sebelum diunggah. Anda dapat memilih lebih dari satu gambar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${id}`)}
                  disabled={isLoading || isCompressingImages}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <AngleLeftIcon className="w-4 h-4" />
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isLoading || isUploadingImages || isCompressingImages || !canEditOrder(orderStatus)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading || isUploadingImages
                    ? "Memperbarui..."
                    : isCompressingImages
                      ? "Memampatkan gambar…"
                      : "Perbarui Pesanan"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

