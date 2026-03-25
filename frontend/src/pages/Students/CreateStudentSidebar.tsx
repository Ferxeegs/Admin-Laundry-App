import { useState, useEffect } from "react";
import { compressProfileImage } from "../../utils/compressOrderImage";
import { useToast } from "../../context/ToastContext";

interface CreateStudentSidebarProps {
  profileImageFile?: File | null;
  onProfileImageChange?: (file: File | null) => void;
  onCompressingChange?: (compressing: boolean) => void;
}

export default function CreateStudentSidebar({
  profileImageFile,
  onProfileImageChange,
  onCompressingChange,
}: CreateStudentSidebarProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const { error: showErrorToast } = useToast();

  useEffect(() => {
    if (!profileImageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(profileImageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profileImageFile]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showErrorToast("Hanya file gambar yang diizinkan.");
      return;
    }

    setIsCompressing(true);
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
    onProfileImageChange?.(null);
  };

  return (
    <div className="w-full space-y-6">
      <div className="p-6 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <h3 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
          Foto Profil
        </h3>
        <div className="flex flex-col items-center justify-center">
          <div className="relative mb-4">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Profile preview"
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={isCompressing}
                  className="absolute -top-2 -right-2 p-1 text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
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
          <label
            className={
              isCompressing ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            }
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={isCompressing}
              className="hidden"
            />
            <span className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors">
              {isCompressing
                ? "Memproses…"
                : imagePreview
                  ? "Ganti Foto"
                  : "Upload Foto"}
            </span>
          </label>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            Maks. 1 MB setelah kompresi (WebP). Foto diperkecil otomatis.
          </p>
        </div>
      </div>
    </div>
  );
}
