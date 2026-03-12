import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
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
  const qrCodeRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadQRCode = async () => {
    if (!qrCodeRef.current || !student || !student.qr_code) return;

    try {
      // Convert QR code element to canvas with high quality
      const canvas = await html2canvas(qrCodeRef.current, {
        backgroundColor: '#ffffff',
        scale: 3, // Higher quality for better print
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: qrCodeRef.current.offsetWidth,
        height: qrCodeRef.current.offsetHeight,
      });

      // Create download link
      const fileName = `QR-${student.fullname.replace(/[^a-zA-Z0-9]/g, '_')}-${student.unique_code || student.id}.png`;
      const link = document.createElement('a');
      link.download = fileName;
      link.href = canvas.toDataURL('image/png', 1.0); // Maximum quality
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading QR code:', err);
      alert('Gagal mengunduh QR code. Silakan coba lagi.');
    }
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
    <div className="space-y-4 sm:space-y-5">
      <PageBreadcrumb pageTitle="View Student" />
      <PageMeta title="View Student" description="View student details" />

      {/* Header - Mobile Optimized */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/students"
            className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white touch-manipulation flex-shrink-0"
          >
            <AngleLeftIcon className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-800 dark:text-white truncate">
              {student.fullname}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
              Detail informasi siswa
            </p>
          </div>
        </div>
        <Link
          to={`/students/${student.id}/edit`}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation w-full sm:w-auto"
        >
          <PencilIcon className="w-4 h-4" />
          <span className="sm:hidden">Edit</span>
          <span className="hidden sm:inline">Edit Student</span>
        </Link>
      </div>

      {/* Mobile-First Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Left Sidebar - Profile & QR Code (Mobile: Full Width, Desktop: 1/3) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile Card */}
          <ComponentCard title="Profile">
            <div className="space-y-5">
              {/* Profile Picture Display */}
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
              <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Status</p>
                  <Badge size="sm" color={student.is_active ? "success" : "error"}>
                    {student.is_active ? "Aktif" : "Tidak Aktif"}
                  </Badge>
                </div>
                {student.unique_code && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Kode Unik</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white font-mono break-all">
                      {student.unique_code}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ComponentCard>

          {/* QR Code Card - Mobile Optimized */}
          {student.qr_code && (
            <ComponentCard title="QR Code">
              <div className="flex flex-col items-center gap-4">
                {/* QR Code Display - Optimized for mobile */}
                <div 
                  ref={qrCodeRef}
                  className="flex flex-col items-center gap-4 p-4 sm:p-6 bg-white rounded-lg border-2 border-gray-200 w-full max-w-[280px] mx-auto"
                >
                  <div className="flex items-center justify-center">
                    <QRCodeSVG
                      value={student.qr_code}
                      size={160}
                      level="H"
                      includeMargin={true}
                      fgColor="#000000"
                      bgColor="#ffffff"
                    />
                  </div>
                  <div className="text-center w-full border-t border-gray-200 pt-3">
                    <p className="text-sm sm:text-base font-bold text-gray-900 break-words px-2">
                      {student.fullname}
                    </p>
                    {student.unique_code && (
                      <p className="text-xs sm:text-sm text-gray-700 font-mono mt-2 font-semibold break-all px-2">
                        {student.unique_code}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDownloadQRCode}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors touch-manipulation"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download QR Code
                </button>
              </div>
            </ComponentCard>
          )}
        </div>

        {/* Main Content - Student Information (Mobile: Full Width, Desktop: 2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Student Information */}
          <ComponentCard title="Informasi Siswa">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nama Lengkap</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {student.fullname}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">NIK</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white break-all">
                  {student.national_id_number}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Asrama</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {student.dormitory || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Kelas</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {student.grade_level || "-"}
                </p>
              </div>
              {student.phone_number && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">No. Telepon</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white break-all">
                    {student.phone_number}
                  </p>
                </div>
              )}
              {student.guardian_name && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nama Wali</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {student.guardian_name}
                  </p>
                </div>
              )}
            </div>
          </ComponentCard>

          {/* Metadata / Timestamps */}
          <ComponentCard title="Metadata">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Dibuat Pada</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {formatDate(student.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Diperbarui Pada</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
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

