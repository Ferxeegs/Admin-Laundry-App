import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { studentAPI } from "../../utils/api";
import { AngleLeftIcon, PencilIcon } from "../../icons";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";
import StudentSidebar from "./StudentSidebar";

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
  deleted_at: string | null;
  created_by: string | null;
  deleted_by: string | null;
  profile_picture?: {
    id: number;
    url: string;
    collection: string;
    file_name: string;
    mime_type: string;
  } | null;
}

export default function ViewStudent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchStudentData();
    }
  }, [id]);

  const fetchStudentData = async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await studentAPI.getStudentById(id);
      if (response.success && response.data) {
        const studentData = response.data as Student;
        setStudent(studentData);
        
        // Set profile image if exists
        if (studentData.profile_picture) {
          // Remove /api/v1 or /api prefix if accidentally included
          let profileUrl = studentData.profile_picture.url;
          profileUrl = profileUrl.replace(/^\/api\/v1/, '');
          profileUrl = profileUrl.replace(/^\/api/, '');
          
          // Ensure it starts with /
          if (!profileUrl.startsWith('/')) {
            profileUrl = `/${profileUrl}`;
          }
          
          // Use relative URL (same origin) for static files
          setProfileImage(profileUrl);
        } else {
          setProfileImage(null);
        }
      } else {
        setError(response.message || "Gagal mengambil data siswa");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch student error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View Student" />
        <PageMeta title="View Student" description="View student details" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={10} columns={2} />
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View Student" />
        <PageMeta title="View Student" description="View student details" />
        <ComponentCard title="Error">
          <div className="p-5 text-center">
            <p className="text-red-600 dark:text-red-400">{error || "Siswa tidak ditemukan"}</p>
            <button
              onClick={() => navigate("/students")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
            >
              Kembali ke Daftar Siswa
            </button>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageBreadcrumb pageTitle="View Student" />
      <PageMeta title="View Student" description="View student details" />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/students"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white touch-manipulation flex-shrink-0"
          >
            <AngleLeftIcon className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white truncate">
              {student.fullname}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 hidden sm:block">
              View student details and information
            </p>
          </div>
        </div>
        <Link
          to={`/students/${student.id}/edit`}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation w-full sm:w-auto"
        >
          <PencilIcon className="w-4 h-4" />
          Edit Student
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Left Sidebar - Profile & Quick Info */}
        <div className="lg:col-span-1">
          <ComponentCard title="Profile">
            <div className="space-y-6">
              {/* Profile Picture Display (Read Only) */}
              <StudentSidebar
                studentId={student.id}
                profileImage={profileImage}
                studentName={student.fullname}
                studentNik={student.national_id_number}
                showStudentInfo={true}
                readOnly={true}
                onProfilePictureUpdated={() => {
                  fetchStudentData();
                }}
              />

              {/* Quick Info */}
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                  <Badge size="sm" color={student.is_active ? "success" : "error"}>
                    {student.is_active ? "Aktif" : "Tidak Aktif"}
                  </Badge>
                </div>
                {student.unique_code && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Kode Unik</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{student.unique_code}</p>
                  </div>
                )}
                {student.qr_code && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">QR Code</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-white break-all">{student.qr_code}</p>
                  </div>
                )}
              </div>
            </div>
          </ComponentCard>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Student Information */}
          <ComponentCard title="Student Information">
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Nama Lengkap</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {student.fullname}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">NIK</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">{student.national_id_number}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Asrama</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {student.dormitory || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Kelas</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {student.grade_level || "-"}
                </p>
              </div>
              {student.phone_number && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">No. Telepon</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {student.phone_number}
                  </p>
                </div>
              )}
              {student.guardian_name && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Nama Wali</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {student.guardian_name}
                  </p>
                </div>
              )}
              {student.unique_code && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Kode Unik</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white font-mono">
                    {student.unique_code}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Auto-generated dari Asrama-Kelas-Nama
                  </p>
                </div>
              )}
              {student.qr_code && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">QR Code</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white font-mono break-all">
                    {student.qr_code}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Auto-generated secure token
                  </p>
                </div>
              )}
            </div>
          </ComponentCard>

          {/* Metadata / Timestamps */}
          <ComponentCard title="Metadata">
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created At</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {formatDate(student.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Updated At</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {formatDate(student.updated_at)}
                </p>
              </div>
            </div>
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}

