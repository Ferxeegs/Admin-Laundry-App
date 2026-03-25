import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { studentAPI, mediaAPI, getBaseUrl } from "../../utils/api";
import { AngleLeftIcon } from "../../icons";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TableSkeleton from "../../components/common/TableSkeleton";
import EditStudentSidebar from "./EditStudentSidebar";
import { useToast } from "../../context/ToastContext";

export default function EditStudent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    national_id_number: "",
    fullname: "",
    phone_number: "",
    dormitory: "",
    grade_level: "",
    guardian_name: "",
    is_active: true,
  });
  const [countryCode, setCountryCode] = useState<string>("+62");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profilePictureMediaId, setProfilePictureMediaId] = useState<number | null>(null);
  const [shouldDeleteProfilePicture, setShouldDeleteProfilePicture] = useState(false);
  const [isCompressingProfile, setIsCompressingProfile] = useState(false);

  useEffect(() => {
    if (id) {
      fetchStudentData();
    }
  }, [id]);

  const fetchStudentData = async () => {
    if (!id) return;

    setIsFetching(true);
    setError(null);

    try {
      const response = await studentAPI.getStudentById(id);
      if (response.success && response.data) {
        const student = response.data;
        setFormData({
          national_id_number: student.national_id_number || "",
          fullname: student.fullname || "",
          phone_number: student.phone_number || "",
          dormitory: student.dormitory || "",
          grade_level: student.grade_level || "",
          guardian_name: student.guardian_name || "",
          is_active: student.is_active ?? true,
        });
        
        // Set country code based on phone number
        if (student.phone_number) {
          if (student.phone_number.startsWith("+62")) {
            setCountryCode("+62");
          } else if (student.phone_number.startsWith("+1")) {
            setCountryCode("+1");
          }
        }

        // Fetch profile picture from media API
        try {
          const mediaResponse = await mediaAPI.getMediaByModel('Student', id, 'profile-pictures');
          if (mediaResponse.success && mediaResponse.data) {
            const mediaArray = Array.isArray(mediaResponse.data) 
              ? mediaResponse.data 
              : (mediaResponse.data as any).media || (mediaResponse.data as any).data || [];
            
            if (mediaArray.length > 0) {
              const media = mediaArray[0];
              let mediaUrl = media.url;
              // Remove /api/v1 or /api prefix if accidentally included
              mediaUrl = mediaUrl.replace(/^\/api\/v1/, '').replace(/^\/api/, '');
              if (!mediaUrl.startsWith('/')) {
                mediaUrl = `/${mediaUrl}`;
              }
              setProfileImage(`${getBaseUrl()}${mediaUrl}`);
              setProfilePictureMediaId(media.id);
            } else {
              setProfileImage(null);
              setProfilePictureMediaId(null);
            }
          } else {
            setProfileImage(null);
            setProfilePictureMediaId(null);
          }
        } catch (err) {
          setProfilePictureMediaId(null);
        }
      } else {
        setError(response.message || "Gagal mengambil data siswa");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch student error:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleFormChange = (name: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id) return;

    setError(null);

    // Client-side validation
    if (formData.national_id_number.trim().length === 0) {
      setError("NIK wajib diisi");
      return;
    }

    if (formData.fullname.trim().length < 2) {
      setError("Nama lengkap minimal 2 karakter");
      return;
    }

    setIsLoading(true);

    try {
      // Format phone number: combine country code with phone number
      let formattedPhoneNumber = null;
      if (formData.phone_number.trim()) {
        let phoneNum = formData.phone_number.trim();
        
        // Remove any existing country code prefix
        if (phoneNum.startsWith("+62")) {
          phoneNum = phoneNum.substring(3);
        } else if (phoneNum.startsWith("+1")) {
          phoneNum = phoneNum.substring(2);
        }
        
        // For Indonesian numbers (+62), format should be +62XXXXXXXXX (without leading 0)
        if (countryCode === "+62") {
          // Remove leading 0 if present
          if (phoneNum.startsWith("0")) {
            phoneNum = phoneNum.substring(1);
          }
          formattedPhoneNumber = "+62" + phoneNum;
        } else if (countryCode === "+1") {
          formattedPhoneNumber = "+1" + phoneNum;
        } else {
          formattedPhoneNumber = countryCode + phoneNum;
        }
      }

      // Update student (unique_code will be auto-regenerated if dormitory/grade_level/fullname changed)
      const updateResponse = await studentAPI.updateStudent(id, {
        national_id_number: formData.national_id_number.trim(),
        fullname: formData.fullname.trim(),
        phone_number: formattedPhoneNumber || null,
        dormitory: formData.dormitory.trim() || null,
        grade_level: formData.grade_level.trim() || null,
        guardian_name: formData.guardian_name.trim() || null,
        is_active: formData.is_active,
      });

      if (!updateResponse.success) {
        const errorMessage = updateResponse.message || "Gagal mengupdate siswa";
        setError(errorMessage);
        showError(errorMessage);
        return;
      }

      if (id) {
        try {
          if (shouldDeleteProfilePicture && profilePictureMediaId) {
            try {
              await mediaAPI.deleteMedia(profilePictureMediaId);
              setProfilePictureMediaId(null);
              setShouldDeleteProfilePicture(false);
            } catch {
              // continue
            }
          }

          if (profileImageFile) {
            if (profilePictureMediaId) {
              try {
                await mediaAPI.deleteMedia(profilePictureMediaId);
                setProfilePictureMediaId(null);
              } catch {
                // continue
              }
            }

            const uploadResult = await mediaAPI.uploadMedia(
              profileImageFile,
              "Student",
              id,
              "profile-pictures"
            );
            if (!uploadResult.success) {
              showError(
                uploadResult.message ||
                  "Gagal mengunggah foto profil (misalnya ukuran atau batas server). Data siswa sudah tersimpan."
              );
            }
          }
        } catch (uploadErr: unknown) {
          console.error("Profile picture error:", uploadErr);
          showError("Gagal memproses foto profil. Data siswa mungkin sudah tersimpan.");
        }
      }

      success("Siswa berhasil diupdate!");
      navigate(`/students/${id}`);
    } catch (err: any) {
      const errorMessage = "Terjadi kesalahan saat mengupdate siswa";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Update student error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Edit Siswa" />
        <PageMeta title="Edit Siswa" description="Edit informasi siswa" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={10} columns={2} />
        </div>
      </div>
    );
  }

  if (error && !formData.fullname) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Edit Siswa" />
        <PageMeta title="Edit Siswa" description="Edit informasi siswa" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => navigate("/students")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
            >
              Kembali ke Daftar Siswa
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Edit Siswa"
        description="Edit informasi siswa"
      />
      <PageBreadcrumb
        pageTitle={
          <div className="flex items-center gap-2 font-normal text-base">
            <Link
              to="/students"
              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Siswa
            </Link>
            <span className="text-gray-600">&gt;</span>
            <Link
              to={`/students/${id}`}
              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Detail Siswa
            </Link>
            <span className="text-gray-600">&gt;</span>
            <span>Edit Siswa</span>
          </div>
        }
        hideBreadcrumb={true}
      />

      <div className="space-y-6">
        {/* Header with Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Edit Siswa
          </h1>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Left Sidebar */}
          <div className="lg:col-span-1">
            <EditStudentSidebar
              profileImageUrl={profileImage}
              profileImageFile={profileImageFile}
              onProfileImageChange={(file) => {
                setProfileImageFile(file);
                setShouldDeleteProfilePicture(false);
              }}
              onProfileImageRemove={() => {
                setProfileImageFile(null);
                setShouldDeleteProfilePicture(true);
                setProfileImage(null);
              }}
              onCompressingChange={setIsCompressingProfile}
            />
          </div>

          {/* Right Content Area */}
          <div className="lg:col-span-3">
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
                    NIS (Nomor Induk Siswa) <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="national_id_number"
                    value={formData.national_id_number}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan NIS"
                    disabled={isLoading || isCompressingProfile}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label>
                    Nama Lengkap <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="fullname"
                    value={formData.fullname}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan nama lengkap"
                    disabled={isLoading || isCompressingProfile}
                  />
                </div>

                <div className="sm:col-span-1">
                  <Label>Asrama</Label>
                  <Input
                    type="text"
                    name="dormitory"
                    value={formData.dormitory}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan asrama"
                    disabled={isLoading || isCompressingProfile}
                  />
                </div>

                <div className="sm:col-span-1">
                  <Label>Kelas</Label>
                  <Input
                    type="text"
                    name="grade_level"
                    value={formData.grade_level}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan kelas"
                    disabled={isLoading || isCompressingProfile}
                  />
                </div>


                <div className="sm:col-span-1">
                  <Label>No. Telepon</Label>
                  <div className="flex gap-2">
                    <select
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                      disabled={isLoading || isCompressingProfile}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      <option value="+62">🇮🇩 +62</option>
                      <option value="+1">🇺🇸 +1</option>
                    </select>
                    <Input
                      type="tel"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                      placeholder="0821-3351-3522"
                      disabled={isLoading || isCompressingProfile}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="sm:col-span-1">
                  <Label>Nama Wali</Label>
                  <Input
                    type="text"
                    name="guardian_name"
                    value={formData.guardian_name}
                    onChange={(e) => handleFormChange(e.target.name, e.target.value)}
                    placeholder="Masukkan nama wali"
                    disabled={isLoading || isCompressingProfile}
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={(e) => handleFormChange(e.target.name, e.target.checked)}
                      disabled={isLoading || isCompressingProfile}
                      className="w-4 h-4 text-brand-500 bg-gray-100 border-gray-300 rounded focus:ring-brand-500 dark:focus:ring-brand-500 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">
                      Aktif
                    </Label>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate(`/students/${id}`)}
                  disabled={isLoading || isCompressingProfile}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <AngleLeftIcon className="w-4 h-4" />
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isLoading || isCompressingProfile}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading
                    ? "Memperbarui..."
                    : isCompressingProfile
                      ? "Memproses foto…"
                      : "Simpan Perubahan"}
                </button>
              </div>
            </div>
          </form>
        </div>
          </div>
        </div>
      </div>
    </>
  );
}

