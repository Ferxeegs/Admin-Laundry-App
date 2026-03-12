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
import { EyeIcon, PencilIcon, TrashBinIcon } from "../../icons";
import TableSkeleton from "../../components/common/TableSkeleton";
import { ConfirmModal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";

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
  
  // Modal states
  const { isOpen: isDeleteModalOpen, openModal: openDeleteModal, closeModal: closeDeleteModal } = useModal();
  const [selectedStudentForDelete, setSelectedStudentForDelete] = useState<{ id: string; name: string } | null>(null);

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
        fetchStudents();
      } else {
        setError(response.message || "Gagal menghapus siswa permanen");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan saat menghapus siswa permanen");
      console.error("Force delete student error:", err);
    } finally {
      setDeletingStudentId(null);
      setSelectedStudentForDelete(null);
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
          <button
            onClick={() => {
              setShowDeleted(!showDeleted);
              setPage(1);
            }}
            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors touch-manipulation ${
              showDeleted
                ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            }`}
          >
            <span className="hidden sm:inline">{showDeleted ? "Show Active Students" : "Show Deleted Students"}</span>
            <span className="sm:hidden">{showDeleted ? "Active" : "Deleted"}</span>
          </button>
          <button
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
            <span className="hidden sm:inline">Create Student</span>
            <span className="sm:hidden">Create</span>
          </button>
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
              onClick={() => navigate(`/students/${student.id}`)}
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
                      {student.national_id_number}
                    </span>
                    {student.unique_code && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">•</span>
                        <span className="text-gray-500 text-xs dark:text-gray-400 font-mono break-all">
                          {student.unique_code}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Secondary Info - Compact Grid with Fixed Label Width */}
              {(student.dormitory || student.grade_level || student.phone_number) && (
                <div className="space-y-1.5 mb-2 text-xs">
                  {student.dormitory && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[60px]">Asrama:</span>
                      <span className="text-gray-800 dark:text-white font-medium flex-1">{student.dormitory}</span>
                    </div>
                  )}
                  {student.grade_level && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[60px]">Kelas:</span>
                      <span className="text-gray-800 dark:text-white font-medium flex-1">{student.grade_level}</span>
                    </div>
                  )}
                  {student.phone_number && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[60px]">Telp:</span>
                      <span className="text-gray-800 dark:text-white font-medium flex-1 break-all">{student.phone_number}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions - Compact */}
              <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100 dark:border-gray-700">
                {!showDeleted && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/students/${student.id}`);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 touch-manipulation"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/students/${student.id}/edit`);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </>
                )}
                {showDeleted && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleForceDeleteClick(student.id, student.fullname);
                    }}
                    disabled={deletingStudentId === student.id}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  >
                    <TrashBinIcon className="w-3.5 h-3.5" />
                    {deletingStudentId === student.id ? "Deleting..." : "Force Delete"}
                  </button>
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
            <TableSkeleton rows={10} columns={7} showAvatar={true} />
          ) : students.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500 dark:text-gray-400">
            {search 
              ? `Tidak ada ${showDeleted ? "deleted " : ""}siswa yang ditemukan` 
              : `Belum ada ${showDeleted ? "deleted " : ""}siswa`}
          </div>
        </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Siswa
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    NIK
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Asrama
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Kelas
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Status
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Tanggal Daftar
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {students.map((student) => (
                  <TableRow 
                    key={student.id} 
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <TableCell className="px-5 py-4">
                      <div 
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        {student.profile_picture ? (
                          <img
                            src={`${getBaseUrl()}${student.profile_picture.url}`}
                            alt={student.fullname}
                            className="h-10 w-10 overflow-hidden rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-sm">
                            {getInitials(student)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {student.fullname}
                          </p>
                          {student.phone_number && (
                            <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                              {student.phone_number}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                      <div 
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        {student.national_id_number}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                      <div 
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        {student.dormitory || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                      <div 
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        {student.grade_level || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div 
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        <Badge size="sm" color={student.is_active ? "success" : "error"}>
                          {student.is_active ? "Aktif" : "Tidak Aktif"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                      <div 
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${student.id}`)}
                      >
                        {formatDate(student.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {!showDeleted && (
                          <>
                            <button
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                navigate(`/students/${student.id}`);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                              title="Lihat Detail"
                            >
                              <EyeIcon className="w-4 h-4 fill-current" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/students/${student.id}/edit`);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                              title="Edit Student"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {showDeleted && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleForceDeleteClick(student.id, student.fullname);
                            }}
                            disabled={deletingStudentId === student.id}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Force Delete (Permanent)"
                          >
                            <TrashBinIcon className="w-4 h-4" />
                            {deletingStudentId === student.id ? "Deleting..." : "Force Delete"}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
        confirmText="Delete Permanently"
        cancelText="Cancel"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={deletingStudentId === selectedStudentForDelete?.id}
        showWarning={true}
        warningMessage="Tindakan ini TIDAK DAPAT DIBATALKAN dan akan menghapus semua data terkait siswa ini secara permanen termasuk semua order laundry."
      />
    </div>
  );
}

