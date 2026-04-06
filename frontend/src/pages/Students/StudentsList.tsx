import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import { studentAPI, getBaseUrl } from "../../utils/api";
import { EyeIcon, PencilIcon, TrashBinIcon, CheckCircleIcon } from "../../icons";
import TableSkeleton from "../../components/common/TableSkeleton";
import { ConfirmModal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

interface Student {
  id: string;
  student_number: string;
  fullname: string;
  phone_number: string | null;
  guardian_name: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
  profile_picture?: {
    id: number;
    url: string;
    collection: string;
    file_name: string;
    mime_type: string;
  } | null;
}

export default function StudentsList() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { hasPermission } = useAuth();

  const canViewStudent = hasPermission("view_student");
  const canCreateStudent = hasPermission("create_student");
  const canUpdateStudent = hasPermission("update_student");
  const canDeleteStudent = hasPermission("delete_student");
  const canRestoreStudent = hasPermission("restore_student");
  const canForceDeleteStudent = hasPermission("force_delete_student");
  const canViewDeletedStudents = hasPermission([
    "delete_student",
    "force_delete_student",
    "restore_student",
  ]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [restoringStudentId, setRestoringStudentId] = useState<string | null>(null);

  // Modal states
  const { isOpen: isDeleteModalOpen, openModal: openDeleteModal, closeModal: closeDeleteModal } = useModal();
  const { isOpen: isSoftDeleteModalOpen, openModal: openSoftDeleteModal, closeModal: closeSoftDeleteModal } = useModal();
  const { isOpen: isRestoreModalOpen, openModal: openRestoreModal, closeModal: closeRestoreModal } = useModal();
  const [selectedStudentForDelete, setSelectedStudentForDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedStudentForRestore, setSelectedStudentForRestore] = useState<{ id: string; name: string } | null>(null);

  const fetchStudents = async (forceLoading = false) => {
    if (forceLoading || students.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = showDeleted
        ? await studentAPI.getDeletedStudents({
          page,
          limit: 10,
          search: search.trim() || undefined,
        })
        : await studentAPI.getAllStudents({
          page,
          limit: 10,
          search: search.trim() || undefined,
        });

      if (response.success && response.data) {
        setStudents(response.data.students as Student[]);
        setPagination(response.data.pagination);
      } else {
        setError(response.message || "Gagal mengambil data siswa");
        console.error("Students response:", response);
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch students error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents(false);
  }, [page, showDeleted]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchStudents();
      } else {
        setPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const handleDeleteClick = (studentId: string, studentName: string) => {
    setSelectedStudentForDelete({ id: studentId, name: studentName });
    openSoftDeleteModal();
  };

  const handleDelete = async () => {
    if (!selectedStudentForDelete) return;

    const studentId = selectedStudentForDelete.id;
    setDeletingStudentId(studentId);
    setError(null);
    closeSoftDeleteModal();

    try {
      const response = await studentAPI.deleteStudent(studentId);

      if (response.success) {
        success("Siswa berhasil dihapus!");
        fetchStudents();
      } else {
        const errorMessage = response.message || "Gagal menghapus siswa";
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = "Terjadi kesalahan saat menghapus siswa";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Delete student error:", err);
    } finally {
      setDeletingStudentId(null);
      setSelectedStudentForDelete(null);
    }
  };

  const handleForceDeleteClick = (studentId: string, studentName: string) => {
    setSelectedStudentForDelete({ id: studentId, name: studentName });
    openDeleteModal();
  };

  const handleForceDelete = async () => {
    if (!selectedStudentForDelete) return;

    const studentId = selectedStudentForDelete.id;
    setDeletingStudentId(studentId);
    setError(null);
    closeDeleteModal();

    try {
      const response = await studentAPI.forceDeleteStudent(studentId);

      if (response.success) {
        success("Siswa berhasil dihapus permanen!");
        fetchStudents();
      } else {
        const errorMessage = response.message || "Gagal menghapus siswa permanen";
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = "Terjadi kesalahan saat menghapus siswa permanen";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Force delete student error:", err);
    } finally {
      setDeletingStudentId(null);
      setSelectedStudentForDelete(null);
    }
  };

  const handleRestoreClick = (studentId: string, studentName: string) => {
    setSelectedStudentForRestore({ id: studentId, name: studentName });
    openRestoreModal();
  };

  const handleRestore = async () => {
    if (!selectedStudentForRestore) return;

    const studentId = selectedStudentForRestore.id;
    setRestoringStudentId(studentId);
    setError(null);
    closeRestoreModal();

    try {
      const response = await studentAPI.restoreStudent(studentId);

      if (response.success) {
        success("Siswa berhasil dipulihkan!");
        fetchStudents();
      } else {
        const errorMessage = response.message || "Gagal memulihkan siswa";
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = "Terjadi kesalahan saat memulihkan siswa";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Restore student error:", err);
    } finally {
      setRestoringStudentId(null);
      setSelectedStudentForRestore(null);
    }
  };

  const getInitials = (student: Student) => {
    const names = student.fullname.split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return student.fullname.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search and Filters - Compact for Mobile */}
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Cari siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 sm:h-11 rounded-lg border border-gray-200 bg-transparent py-2 pl-10 sm:pl-12 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
          />
          <svg
            className="absolute -translate-y-1/2 left-3 sm:left-4 top-1/2 fill-gray-500 dark:fill-gray-400"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canViewDeletedStudents && (
            <button
              type="button"
              onClick={() => {
                setShowDeleted(!showDeleted);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors touch-manipulation ${showDeleted
                  ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                }`}
            >
              <span className="hidden sm:inline">{showDeleted ? "Siswa Aktif" : "Siswa Terhapus"}</span>
              <span className="sm:hidden">{showDeleted ? "Aktif" : "Terhapus"}</span>
            </button>
          )}
          {canCreateStudent && (
            <button
              type="button"
              onClick={() => navigate("/students/create")}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation"
            >
              <svg
                className="w-3.5 h-3.5 sm:w-4 sm:h-4"
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
              <span className="hidden sm:inline">Tambah Siswa</span>
              <span className="sm:hidden">Tambah</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 sm:p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Mobile Card View - Compact Design */}
      <div className="block md:hidden space-y-2">
        {isLoading && students.length === 0 ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-gray-200 rounded-full dark:bg-gray-700"></div>
                  <div className="flex-1">
                    <div className="h-3.5 bg-gray-200 rounded w-3/4 mb-1.5 dark:bg-gray-700"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 dark:bg-gray-700"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500 dark:text-gray-400 text-sm text-center">
              {search
                ? `Tidak ada ${showDeleted ? "deleted " : ""}siswa yang ditemukan`
                : `Belum ada ${showDeleted ? "deleted " : ""}siswa`}
            </div>
          </div>
        ) : (
          students.map((student) => (
            <div
              key={student.id}
              className="p-3 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-700/50 transition-colors"
              onClick={() => {
                if (!showDeleted && canViewStudent) {
                  navigate(`/students/${student.id}`);
                }
              }}
              role={!showDeleted && canViewStudent ? "button" : undefined}
            >
              {/* Main Info Row */}
              <div className="flex items-start gap-2.5 mb-2.5">
                {student.profile_picture ? (
                  <img
                    src={`${getBaseUrl()}${student.profile_picture.url}`}
                    alt={student.fullname}
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 mt-0.5">
                    {getInitials(student)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-gray-800 text-sm dark:text-white/90 truncate flex-1">
                      {student.fullname}
                    </p>
                    <div className="flex-shrink-0">
                      <Badge size="sm" color={student.is_active ? "success" : "error"}>
                        {student.is_active ? "Aktif" : "Tidak Aktif"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500 text-xs dark:text-gray-400 break-all">
                      {student.student_number}
                    </span>
                  </div>
                </div>
              </div>

              {/* Secondary Info - Compact Grid with Fixed Label Width */}
              {student.phone_number && (
                <div className="space-y-1.5 mb-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 dark:text-gray-400 min-w-[60px]">Telp:</span>
                    <span className="text-gray-800 dark:text-white font-medium flex-1 break-all">{student.phone_number}</span>
                  </div>
                </div>
              )}

              {/* Actions - Compact */}
              <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100 dark:border-gray-700">
                {!showDeleted && (
                  <>
                    {canViewStudent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/students/${student.id}`);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 touch-manipulation"
                      >
                        <EyeIcon className="w-3.5 h-3.5" />
                        View
                      </button>
                    )}
                    {canUpdateStudent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/students/${student.id}/edit`);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    {canDeleteStudent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(student.id, student.fullname);
                        }}
                        disabled={deletingStudentId === student.id}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                      >
                        <TrashBinIcon className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </>
                )}
                {showDeleted && (
                  <div className="flex w-full gap-2">
                    {canRestoreStudent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreClick(student.id, student.fullname);
                        }}
                        disabled={restoringStudentId === student.id || deletingStudentId === student.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        {restoringStudentId === student.id ? "Memulihkan..." : "Pulihkan"}
                      </button>
                    )}
                    {canForceDeleteStudent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleForceDeleteClick(student.id, student.fullname);
                        }}
                        disabled={deletingStudentId === student.id || restoringStudentId === student.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                      >
                        <TrashBinIcon className="w-3.5 h-3.5" />
                        {deletingStudentId === student.id ? "Deleting..." : "Force Delete"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto custom-scrollbar">
          {isLoading && students.length === 0 ? (
            <TableSkeleton rows={10} columns={5} showAvatar={true} />
          ) : students.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                {search
                  ? `Tidak ada ${showDeleted ? "siswa terhapus" : ""} yang ditemukan`
                  : `Belum ada ${showDeleted ? "siswa terhapus " : ""}`}
              </div>
            </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
              <Table className="w-full table-fixed border-collapse">
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-semibold text-gray-500 dark:text-gray-400 w-[280px]">
                      Siswa
                    </TableCell>
                    <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-semibold text-gray-500 dark:text-gray-400 w-[150px]">
                      NIS
                    </TableCell>
                    <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-semibold text-gray-500 dark:text-gray-400 w-[130px]">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-semibold text-gray-500 dark:text-gray-400 w-[180px]">
                      Tanggal Daftar
                    </TableCell>
                    <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-semibold text-gray-500 dark:text-gray-400">
                      Aksi
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {students.map((student) => {
                    const isClickable = !showDeleted && canViewStudent;
                    return (
                      <TableRow
                        key={student.id}
                        className={`transition-colors ${
                          isClickable 
                            ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]" 
                            : "hover:bg-gray-50/50"
                        }`}
                        onClick={() => {
                          if (isClickable) navigate(`/students/${student.id}`);
                        }}
                      >
                        {/* Kolom Siswa - Centered Block */}
                        <TableCell className="px-5 py-4 align-middle">
                          <div className="flex items-center gap-3 text-left w-full">
                            <div className="shrink-0">
                              {student.profile_picture ? (
                                <img
                                  src={`${getBaseUrl()}${student.profile_picture.url}`}
                                  alt={student.fullname}
                                  className="h-10 w-10 overflow-hidden rounded-full object-cover border border-gray-100 dark:border-gray-700"
                                />
                              ) : (
                                <div className="h-10 w-10 overflow-hidden rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-xs">
                                  {getInitials(student)}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <p className="font-medium text-theme-sm truncate text-gray-800 dark:text-white/90">
                                {student.fullname}
                              </p>
                              {student.phone_number && (
                                <span className="text-gray-500 text-[11px] dark:text-gray-400 truncate">
                                  {student.phone_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-center align-middle">
                          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                            {student.student_number || "—"}
                          </span>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-center align-middle">
                          <div className="flex justify-center">
                            <Badge size="sm" color={student.is_active ? "success" : "error"}>
                              {student.is_active ? "Aktif" : "Tidak Aktif"}
                            </Badge>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-center align-middle text-gray-500 text-sm">
                          {formatDate(student.created_at)}
                        </TableCell>

                        <TableCell className="px-5 py-4 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {!showDeleted ? (
                              <>
                                {canViewStudent && (
                                  <button
                                    onClick={() => navigate(`/students/${student.id}`)}
                                    className="p-1.5 text-gray-500 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                                    title="Lihat Detail"
                                  >
                                    <EyeIcon className="w-4 h-4" />
                                  </button>
                                )}
                                {canUpdateStudent && (
                                  <button
                                    onClick={() => navigate(`/students/${student.id}/edit`)}
                                    className="p-1.5 text-gray-500 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                                    title="Edit Siswa"
                                  >
                                    <PencilIcon className="w-4 h-4" />
                                  </button>
                                )}
                                {canDeleteStudent && (
                                  <button
                                    onClick={() => handleDeleteClick(student.id, student.fullname)}
                                    disabled={deletingStudentId === student.id}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                                    title="Hapus Siswa"
                                  >
                                    <TrashBinIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <div className="flex gap-2">
                                {canRestoreStudent && (
                                  <button
                                    onClick={() => handleRestoreClick(student.id, student.fullname)}
                                    disabled={restoringStudentId === student.id || deletingStudentId === student.id}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircleIcon className="w-3.5 h-3.5" />
                                    {restoringStudentId === student.id ? "..." : "Pulihkan"}
                                  </button>
                                )}
                                {canForceDeleteStudent && (
                                  <button
                                    onClick={() => handleForceDeleteClick(student.id, student.fullname)}
                                    disabled={deletingStudentId === student.id || restoringStudentId === student.id}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                                  >
                                    <TrashBinIcon className="w-3.5 h-3.5" />
                                    {deletingStudentId === student.id ? "..." : "Hapus"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
            Menampilkan {((page - 1) * pagination.limit) + 1} - {Math.min(page * pagination.limit, pagination.total)} dari {pagination.total}
          </div>
          <div className="flex gap-2 justify-center sm:justify-end">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isSoftDeleteModalOpen}
        onClose={closeSoftDeleteModal}
        onConfirm={handleDelete}
        title="Hapus Siswa"
        message={
          <>
            Apakah Anda yakin ingin menghapus siswa <strong className="text-gray-800 dark:text-white">{selectedStudentForDelete?.name}</strong>?
          </>
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={deletingStudentId === selectedStudentForDelete?.id}
        showWarning={true}
        warningMessage="Siswa akan dihapus (soft delete) dan dapat dipulihkan kembali dari halaman siswa terhapus."
      />

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={isRestoreModalOpen}
        onClose={closeRestoreModal}
        onConfirm={handleRestore}
        title="Pulihkan Siswa"
        message={
          <>
            Pulihkan siswa <strong className="text-gray-800 dark:text-white">{selectedStudentForRestore?.name}</strong> ke daftar aktif?
          </>
        }
        confirmText="Pulihkan"
        cancelText="Batal"
        confirmButtonColor="primary"
        icon={<CheckCircleIcon className="w-6 h-6" />}
        isLoading={restoringStudentId === selectedStudentForRestore?.id}
        showWarning={false}
      />

      {/* Force Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleForceDelete}
        title="Hapus Permanen Siswa"
        message={
          <>
            Apakah Anda yakin ingin menghapus permanen siswa <strong className="text-gray-800 dark:text-white">{selectedStudentForDelete?.name}</strong>?
          </>
        }
        confirmText="Hapus Permanen"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={deletingStudentId === selectedStudentForDelete?.id}
        showWarning={true}
        warningMessage="Tindakan ini TIDAK DAPAT DIBATALKAN dan akan menghapus semua data terkait siswa ini secara permanen termasuk semua pesanan laundry."
      />
    </div>
  );
}

