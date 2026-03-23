import { useState, useEffect } from "react";
import { mediaAPI, getBaseUrl } from "../../utils/api";

interface StudentSidebarProps {
  studentId: string;
  profileImage?: string | null;
  onProfileImageChange?: (file: File | null) => void;
  onProfilePictureUpdated?: () => void;
  studentName?: string;
  studentNik?: string;
  showStudentInfo?: boolean;
  readOnly?: boolean;
}

export default function StudentSidebar({
  studentId,
  profileImage,
  onProfileImageChange,
  onProfilePictureUpdated,
  studentName,
  studentNik,
  showStudentInfo = false,
  readOnly = false,
}: StudentSidebarProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentProfilePictureId, setCurrentProfilePictureId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Helper function to normalize image URL
  const normalizeImageUrl = (url: string): string => {
    if (url.startsWith('http') || url.startsWith('/') || url.startsWith('blob:')) {
      return url;
    }
    return `${getBaseUrl()}${url.startsWith('/') ? url : `/${url}`}`;
  };

  // Helper function to extract media array from API response
  const extractMediaArray = (responseData: any): any[] | null => {
    if (!responseData) return null;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData.media && Array.isArray(responseData.media)) {
      return responseData.media;
    }
    
    if (responseData.data && Array.isArray(responseData.data)) {
      return responseData.data;
    }
    
    return null;
  };

  // Fetch existing profile picture on mount and when studentId changes
  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (!studentId) {
        setImagePreview(profileImage ? normalizeImageUrl(profileImage) : null);
        setCurrentProfilePictureId(null);
        return;
      }
      
      try {
        const response = await mediaAPI.getMediaByModel('Student', studentId, 'profile-pictures');
        const mediaArray = extractMediaArray(response.data);
        
        if (response.success && mediaArray && mediaArray.length > 0) {
          const media = mediaArray[0];
          let mediaUrl = media.url;
          
          // Remove /api/v1 or /api prefix if accidentally included
          mediaUrl = mediaUrl.replace(/^\/api\/v1/, '').replace(/^\/api/, '');
          
          // Ensure it starts with /
          if (!mediaUrl.startsWith('/')) {
            mediaUrl = `/${mediaUrl}`;
          }
          
          setImagePreview(`${getBaseUrl()}${mediaUrl}`);
          setCurrentProfilePictureId(media.id);
          setImageError(false);
        } else {
          // No profile picture found, use prop if available
          setImagePreview(profileImage ? normalizeImageUrl(profileImage) : null);
          setCurrentProfilePictureId(null);
          setImageError(false);
        }
      } catch (err) {
        // Fallback to prop if available
        setImagePreview(profileImage ? normalizeImageUrl(profileImage) : null);
        setCurrentProfilePictureId(null);
        setImageError(false);
      }
    };

    fetchProfilePicture();
  }, [studentId, profileImage]);

  // Update image preview when profileImage prop changes
  useEffect(() => {
    if (profileImage) {
      setImagePreview(normalizeImageUrl(profileImage));
      setImageError(false);
    } else if (!studentId && !imagePreview) {
      setImagePreview(null);
    }
  }, [profileImage, studentId]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Hanya file gambar yang diizinkan');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Ukuran file maksimal 5MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    // Store old profile picture ID before upload
    const oldProfilePictureId = currentProfilePictureId;

    try {
      // Show preview immediately
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload new profile picture first
      const uploadResponse = await mediaAPI.uploadMedia(
        file,
        'Student',
        studentId,
        'profile-pictures'
      );

      if (uploadResponse.success && uploadResponse.data) {
        // Update state with new profile picture
        setCurrentProfilePictureId((uploadResponse.data as any).id);
        const serverUrl = `${getBaseUrl()}${(uploadResponse.data as any).url}`;
        setImagePreview(serverUrl);
        setImageError(false);
        
        // Delete old profile picture after successful upload
        if (oldProfilePictureId) {
          try {
            await mediaAPI.deleteMedia(oldProfilePictureId);
          } catch (err) {
            // Silently fail - old picture deletion is not critical
            // The old picture will remain in storage but won't be referenced
          }
        }
        
        onProfileImageChange?.(file);
        onProfilePictureUpdated?.();
      } else {
        setUploadError(uploadResponse.message || 'Gagal mengupload foto profil');
        // Revert to blob preview on error
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      setUploadError('Terjadi kesalahan saat mengupload foto profil');
      // Revert to previous image if available
      if (profileImage) {
        setImagePreview(normalizeImageUrl(profileImage));
      } else {
        setImagePreview(null);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const getInitials = () => {
    if (!studentName) return "??";
    const names = studentName.split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return studentName.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* Profile Picture with Student Info */}
      <div className="flex flex-col items-center">
        {uploadError && (
          <div className="mb-2 p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            {uploadError}
          </div>
        )}
        <div className="relative mb-3">
          {imagePreview && !imageError ? (
            <img
              src={imagePreview}
              alt="Profile"
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
              onError={() => setImageError(true)}
              onLoad={() => setImageError(false)}
            />
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-3xl sm:text-4xl border-4 border-gray-200 dark:border-gray-700">
              {getInitials()}
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full z-10">
              <div className="text-white text-sm">Uploading...</div>
            </div>
          )}
        </div>
        
        {showStudentInfo && (
          <>
            {studentName && (
              <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-semibold text-gray-800 dark:text-white text-center">
                {studentName}
              </h3>
            )}
            {studentNik && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center">
                NIK: {studentNik}
              </p>
            )}
          </>
        )}
      </div>

      {/* Profile Picture Upload - Only show if not readOnly */}
      {!readOnly && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Foto Profil
          </label>
          <div className="flex flex-col items-center">
            <label
              htmlFor="profile-picture-upload"
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 cursor-pointer transition-colors ${
                isUploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {isUploading ? 'Uploading...' : 'Upload Foto'}
            </label>
            <input
              id="profile-picture-upload"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={isUploading}
              className="hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
