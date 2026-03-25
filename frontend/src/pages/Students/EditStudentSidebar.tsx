import { useState, useEffect, useRef } from "react";
import { compressProfileImage } from "../../utils/compressOrderImage";
import { useToast } from "../../context/ToastContext";

interface EditStudentSidebarProps {
  /** URL foto dari server (ditampilkan jika belum ada file baru) */
  profileImageUrl?: string | null;
  /** File foto baru yang sudah dikompres (opsional) */
  profileImageFile?: File | null;
  onProfileImageChange?: (file: File | null) => void;
  onProfileImageRemove?: () => void;
  onCompressingChange?: (compressing: boolean) => void;
}

export default function EditStudentSidebar({
  profileImageUrl,
  profileImageFile,
  onProfileImageChange,
  onProfileImageRemove,
  onCompressingChange,
}: EditStudentSidebarProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(profileImageUrl || null);
  const [imageError, setImageError] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: showErrorToast } = useToast();

  useEffect(() => {
    if (profileImageFile) {
      const url = URL.createObjectURL(profileImageFile);
      setImagePreview(url);
      setImageError(false);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(profileImageUrl || null);
    setImageError(false);
  }, [profileImageFile, profileImageUrl]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showErrorToast("Hanya file gambar yang diizinkan.");
      return;
    }

    setIsCompressing(true);
    onCompressingChange?.(true);
    try {
      const compressed = await compressProfileImage(file);
      onProfileImageChange?.(compressed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memproses gambar. Coba gambar lain atau ukuran lebih kecil.";
      showErrorToast(msg);
      onProfileImageChange?.(null);
    } finally {
      setIsCompressing(false);
      onCompressingChange?.(false);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onProfileImageRemove?.();
  };

  return (
    <div className="w-full space-y-6">
      <div className="p-6 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <h3 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
          Foto Profil
        </h3>
        <div className="flex flex-col items-center justify-center">
          <div className="relative mb-4">
            {imagePreview && !imageError ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Profile preview"
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                  onError={() => setImageError(true)}
                  onLoad={() => setImageError(false)}
                />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 w-full">
            <label
              className={
                isCompressing ? "cursor-not-allowed opacity-70 w-full" : "cursor-pointer w-full"
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={isCompressing}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors">
                {isCompressing
                  ? "Memproses…"
                  : imagePreview
                    ? "Ganti Foto"
                    : "Upload Foto"}
              </span>
            </label>
            {imagePreview && (
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isCompressing}
                className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Hapus Foto
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            Maks. 1 MB setelah kompresi (WebP). Foto diperkecil otomatis.
          </p>
        </div>
      </div>
    </div>
  );
}
