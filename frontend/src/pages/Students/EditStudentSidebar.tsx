import { useState, useEffect, useRef } from "react";

interface EditStudentSidebarProps {
  profileImage?: string | null;
  onProfileImageChange?: (file: File | null) => void;
  onProfileImageRemove?: () => void;
}

export default function EditStudentSidebar({
  profileImage,
  onProfileImageChange,
  onProfileImageRemove,
}: EditStudentSidebarProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(profileImage || null);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profileImage) {
      setImagePreview(profileImage);
      setImageError(false);
    } else {
      setImagePreview(null);
      setImageError(false);
    }
  }, [profileImage]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Hanya file gambar yang diizinkan');
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Ukuran file maksimal 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setImageError(false);
      };
      reader.readAsDataURL(file);
      onProfileImageChange?.(file);
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
      {/* Profile Picture Upload */}
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
                {/* <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 p-1.5 text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors shadow-lg"
                  title="Hapus foto"
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
                </button> */}
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
            <label className="cursor-pointer w-full">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors">
                {imagePreview ? "Ganti Foto" : "Upload Foto"}
              </span>
            </label>
            {imagePreview && (
              <button
                type="button"
                onClick={handleRemoveImage}
                className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
              >
                Hapus Foto
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            Maksimal 5MB. Format: JPG, PNG, GIF
          </p>
        </div>
      </div>
    </div>
  );
}
