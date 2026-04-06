import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { studentAPI, orderAPI } from "../../utils/api";
import { AngleLeftIcon, PencilIcon } from "../../icons";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import StudentSidebar from "./StudentSidebar";
import { useAuth } from "../../context/AuthContext";

interface MonthlyOrderStat {
  monthYear: string;
  sortKey: string;
  orderCount: number;
  totalItems: number;
  freeItems: number;
  paidItems: number;
  additionalFee: number;
}

interface Student {
  id: string;
  student_number: string;
  fullname: string;
  phone_number: string | null;
  guardian_name: string | null;
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
  const [monthlyStats, setMonthlyStats] = useState<MonthlyOrderStat[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const { hasPermission } = useAuth();
  const canEditStudent = hasPermission("update_student");

  useEffect(() => {
    if (id) {
      fetchStudentData();
      fetchStudentOrders();
    }
  }, [id]);

  const fetchStudentOrders = async () => {
    if (!id) return;
    setIsLoadingOrders(true);
    try {
      const response = await orderAPI.getAllOrders({ student_id: id, limit: 1000 });
      if (response.success && response.data && response.data.orders) {
        const stats: Record<string, MonthlyOrderStat> = {};
        
        response.data.orders.forEach((order) => {
          if (!order.created_at) return;
          const date = new Date(order.created_at);
          
          const monthYear = date.toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
          });
          
          const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          
          if (!stats[sortKey]) {
            stats[sortKey] = {
              monthYear,
              sortKey,
              orderCount: 0,
              totalItems: 0,
              freeItems: 0,
              paidItems: 0,
              additionalFee: 0,
            };
          }
          
          stats[sortKey].orderCount += 1;
          stats[sortKey].totalItems += order.total_items || 0;
          stats[sortKey].freeItems += order.free_items_used || 0;
          stats[sortKey].paidItems += order.paid_items_count || 0;
          stats[sortKey].additionalFee += order.additional_fee || 0;
        });
        
        const sortedStats = Object.values(stats).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        setMonthlyStats(sortedStats);
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

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
    <div className="space-y-4 sm:space-y-5">
      <PageBreadcrumb pageTitle="Detail Siswa" />
      <PageMeta title="Detail Siswa" description="Detail informasi siswa" />

      {/* Header - Mobile Optimized */}
      <div className="flex items-center gap-2 sm:gap-3 pb-2 sm:pb-0">
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
            Detail informasi siswa
          </p>
        </div>
        {canEditStudent && (
          <Link
            to={`/students/${student.id}/edit`}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation flex-shrink-0 sm:px-4 sm:py-2.5"
          >
            <PencilIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Edit Siswa</span>
          </Link>
        )}
      </div>

      {/* Mobile-First Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Left Sidebar - Profile & QR Code (Mobile: Full Width, Desktop: 1/3) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile Card */}
          <ComponentCard title="Profil">
            <div className="space-y-5">
              {/* Profile Picture Display */}
              <StudentSidebar
                studentId={student.id}
                profileImage={profileImage}
                studentName={student.fullname}
                studentNik={student.student_number}
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
              </div>
            </div>
          </ComponentCard>
        </div>

        {/* Main Content - Student Information (Mobile: Full Width, Desktop: 2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Student Information */}
          <ComponentCard title="Detail Siswa">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nama Lengkap</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {student.fullname}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">NIS</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white break-all">
                  {student.student_number}
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

          {/* Riwayat Pesanan Bulanan */}
          <ComponentCard title="Riwayat Pesanan (Kumulatif per Bulan)">
            {isLoadingOrders ? (
              <TableSkeleton rows={3} columns={5} />
            ) : monthlyStats.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data pesanan</p>
              </div>
            ) : (
              <>
                {/* Mobile View */}
                <div className="block md:hidden space-y-3">
                  {monthlyStats.map((stat) => (
                    <div key={stat.sortKey} className="p-4 bg-white border border-gray-100 rounded-xl dark:bg-gray-800 dark:border-gray-700 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-semibold text-gray-800 dark:text-white">{stat.monthYear}</span>
                        <Badge size="sm" color="success">
                          {stat.orderCount} Pesanan
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center items-center divide-x divide-gray-100 dark:divide-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                        <div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Kelebihan</p>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{stat.paidItems} <span className="text-xs font-normal">pcs</span></p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tambahan Biaya</p>
                          <p className="font-medium text-brand-600 dark:text-brand-400">Rp {stat.additionalFee.toLocaleString("id-ID")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="max-w-full overflow-x-auto custom-scrollbar">
                    <Table>
                      <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                        <TableRow>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Bulan</TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Jumlah Pesanan</TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Total Kelebihan</TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Tambahan Biaya</TableCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                        {monthlyStats.map((stat) => (
                          <TableRow key={stat.sortKey} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                            <TableCell className="px-5 py-4 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                              {stat.monthYear}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                              {stat.orderCount} pesanan
                            </TableCell>
                            <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                              {stat.paidItems > 0 ? (
                                 <span className="text-gray-800 dark:text-white font-medium">{stat.paidItems} pcs</span>
                              ) : (
                                 "0 pcs"
                              )}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                              {stat.additionalFee > 0 ? (
                                 <span className="text-brand-500 dark:text-brand-400 font-medium">Rp {stat.additionalFee.toLocaleString("id-ID")}</span>
                              ) : (
                                 "Rp 0"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}

