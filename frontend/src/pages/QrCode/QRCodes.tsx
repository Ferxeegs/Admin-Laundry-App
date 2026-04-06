import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { qrCodeAPI, studentAPI } from "../../utils/api";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import TableSkeleton from "../../components/common/TableSkeleton";
import Badge from "../../components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { ConfirmModal, Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { PlusIcon, TrashBinIcon } from "../../icons";

interface QrCode {
  id: string;
  token_qr: string;
  dormitory: string | null;
  qr_number: string | null;
  unique_code: string | null;
  student_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  student: { id: string; fullname: string; student_number: string } | null;
}

interface Student {
  id: string;
  student_number: string;
  fullname: string;
  is_active: boolean;
}

export default function QRCodes() {
  const { success, error: showError } = useToast();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const canCreateQr = hasPermission("create_student");
  const canDeleteQr = hasPermission("delete_student");

  const [qrCodes, setQrCodes] = useState<QrCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "assigned" | "unassigned">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // Delete modal
  const {
    isOpen: isDeleteOpen,
    openModal: openDelete,
    closeModal: closeDelete,
  } = useModal();
  const [deleteQrCode, setDeleteQrCode] = useState<QrCode | null>(null);

  const [isQrCrudLoading, setIsQrCrudLoading] = useState(false);

  // Assign modal
  const { isOpen: isAssignOpen, openModal: openAssign, closeModal: closeAssign } = useModal();
  const [assignQrCode, setAssignQrCode] = useState<QrCode | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Release modal
  const {
    isOpen: isReleaseOpen,
    openModal: openRelease,
    closeModal: closeRelease,
  } = useModal();
  const [releaseQrCode, setReleaseQrCode] = useState<QrCode | null>(null);

  const fetchQrCodes = async (forceLoading = false) => {
    if (forceLoading || qrCodes.length === 0) setIsLoading(true);
    setError(null);

    try {
      const assigned =
        assignedFilter === "all"
          ? undefined
          : assignedFilter === "assigned"
            ? true
            : false;

      const res = await qrCodeAPI.getAllQRCodes({
        page,
        limit: 10,
        search: search.trim() || undefined,
        assigned,
      });

      if (res.success && res.data) {
        setQrCodes(res.data.qr_codes as QrCode[]);
        setPagination(res.data.pagination);
      } else {
        setError(res.message || "Gagal mengambil daftar QR tas");
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchQrCodes(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, assignedFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void fetchQrCodes(true);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDeleteQrFlow = (qr: QrCode) => {
    setDeleteQrCode(qr);
    openDelete();
  };

  const handleDeleteQr = async () => {
    if (!deleteQrCode) return;
    if (deleteQrCode.student_id) {
      showError("QR masih terhubung ke santri. Lepas kaitan sebelum dihapus.");
      return;
    }

    setIsQrCrudLoading(true);
    try {
      const res = await qrCodeAPI.deleteQR(deleteQrCode.id);
      if (!res.success) {
        showError(res.message || res.error || "Gagal menghapus QR.");
        return;
      }

      success("QR berhasil dihapus.");
      closeDelete();
      setDeleteQrCode(null);
      await fetchQrCodes(true);
    } finally {
      setIsQrCrudLoading(false);
    }
  };

  const openAssignFlow = (qr: QrCode) => {
    setAssignQrCode(qr);
    setSelectedStudentId("");
    setStudentSearch("");
    setStudents([]);
    setIsLoadingStudents(false);
    openAssign();
  };

  const fetchStudentsForAssign = async (q: string) => {
    setIsLoadingStudents(true);
    try {
      const res = await studentAPI.getAllStudents({
        page: 1,
        limit: 20,
        is_active: true,
        search: q.trim() || undefined,
      });
      if (res.success && res.data) {
        setStudents(res.data.students as Student[]);
      } else {
        setStudents([]);
      }
    } catch {
      setStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (!isAssignOpen) return;
    const t = setTimeout(() => {
      void fetchStudentsForAssign(studentSearch);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch, isAssignOpen]);

  const handleAssign = async () => {
    if (!assignQrCode) return;
    if (!selectedStudentId) {
      showError("Pilih santri terlebih dahulu.");
      return;
    }

    const res = await qrCodeAPI.assignQR(assignQrCode.id, selectedStudentId);
    if (!res.success) {
      const msg = res.message || res.error || "Gagal mengaitkan QR";
      showError(msg);
      return;
    }

    success("QR berhasil dikaitkan dengan santri.");
    closeAssign();
    setAssignQrCode(null);
    setSelectedStudentId("");
    await fetchQrCodes(true);
  };

  const handleRelease = async () => {
    if (!releaseQrCode) return;
    const res = await qrCodeAPI.releaseQR(releaseQrCode.id);
    if (!res.success) {
      const msg = res.message || res.error || "Gagal melepas QR";
      showError(msg);
      return;
    }
    success("QR berhasil dilepas dari santri.");
    closeRelease();
    setReleaseQrCode(null);
    await fetchQrCodes(true);
  };

  const assignedBadge = (qr: QrCode) => {
    if (!qr.student_id) {
      return (
        <Badge size="sm" color="info">
          Belum terhubung
        </Badge>
      );
    }
    return (
      <Badge size="sm" color="success">
        Terhubung
      </Badge>
    );
  };

  const statusText = useMemo(() => {
    return assignedFilter === "all"
      ? "Semua"
      : assignedFilter === "assigned"
        ? "Terhubung"
        : "Belum terhubung";
  }, [assignedFilter]);

  return (
    <>
      <PageMeta title="QR Tas" description="Kelola QR tas untuk proses laundry" />
      <PageBreadcrumb pageTitle="QR Tas" />

      <div className="space-y-6">
        <ComponentCard title="Kelola QR Tas">
          {isLoading && qrCodes.length === 0 ? (
            <div className="p-5">
              <TableSkeleton rows={8} columns={7} />
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-3 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

              {/* Controls */}
              <div className="mb-6 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
                {/* Search Box */}
                <div className="relative w-full sm:max-w-xs md:max-w-md group">
                  <input
                    type="text"
                    placeholder="Cari asrama/nomor..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 sm:h-11 rounded-lg border border-gray-200 bg-gray-50/50 py-2 pl-10 pr-4 text-sm text-gray-800 transition-all focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-500/5 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Filter & Actions - Desktop: Flex row, Mobile: Tight grid/flex */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:overflow-visible">
                  <div className="shrink-0">
                    <select
                      value={assignedFilter}
                      onChange={(e) => setAssignedFilter(e.target.value as any)}
                      aria-label="Filter status QR"
                      className="h-10 sm:h-11 px-3 text-xs sm:text-sm rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white/90 font-medium outline-none focus:border-brand-300 transition-colors"
                    >
                      <option value="all">Semua Status</option>
                      <option value="unassigned">Belum Terhubung</option>
                      <option value="assigned">Terhubung</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/qr-codes/download")}
                    className="shrink-0 inline-flex items-center justify-center gap-2 h-10 sm:h-11 px-4 text-xs sm:text-sm text-gray-600 font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Label
                  </button>

                  {canCreateQr && (
                    <button
                      type="button"
                      onClick={() => navigate("/qr-codes/create")}
                      disabled={isQrCrudLoading}
                      className="shrink-0 inline-flex items-center justify-center gap-2 h-10 sm:h-11 px-4 text-xs sm:text-sm text-white font-medium bg-brand-500 rounded-lg hover:bg-brand-600 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Tambah
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                {/* Hapus semua spasi antar tag Table, TableHeader, dan TableBody untuk menghindari hydration error */}
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 w-[100px] text-center">
                        QR
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 text-center">
                        Asrama
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 text-center">
                        Nomor / Kode
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 text-center">
                        Santri
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 text-center">
                        Status
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-theme-sm font-semibold text-gray-500 dark:text-gray-400 text-center w-[140px]">
                        Aksi
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qrCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="px-5 py-10 text-center text-gray-500">
                          {statusText}: tidak ada data
                        </TableCell>
                      </TableRow>
                    ) : (
                      qrCodes.map((qr) => (
                        <TableRow key={qr.id} className="hover:bg-gray-50 dark:hover:bg-gray-50/5 transition-colors">
                          {/* Semua cell menggunakan text-center agar lurus dengan header */}
                          <TableCell className="px-4 py-4 align-middle text-center">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <div className="rounded border border-gray-200 bg-white p-1 dark:border-gray-700 shadow-sm inline-block">
                                <QRCodeSVG value={qr.token_qr} size={48} level="M" />
                              </div>
                              <span className="text-[10px] font-mono text-gray-500">{qr.unique_code || "—"}</span>
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-4 align-middle text-center">
                            <span className="text-sm dark:text-white/90">{qr.dormitory || "-"}</span>
                          </TableCell>

                          <TableCell className="px-4 py-4 align-middle text-center">
                            <span className="text-sm font-mono dark:text-white/90">{qr.unique_code || "—"}</span>
                          </TableCell>

                          <TableCell className="px-4 py-4 align-middle text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-medium dark:text-white/90">{qr.student ? qr.student.fullname : "-"}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{qr.student?.student_number || ""}</span>
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-4 align-middle text-center">
                            <div className="flex justify-center">
                              {assignedBadge(qr)}
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-4 align-middle text-center">
                            <div className="flex items-center justify-center gap-2">
                              {!qr.student_id ? (
                                <button
                                  onClick={() => openAssignFlow(qr)}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
                                >
                                  Assign
                                </button>
                              ) : (
                                <button
                                  onClick={() => { setReleaseQrCode(qr); openRelease(); }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                                >
                                  Release
                                </button>
                              )}

                              <div className="flex items-center gap-1 ml-1">
                                {canCreateQr && qr.dormitory && (
                                  <button onClick={() => navigate("/qr-codes/edit", { state: { dormitory: qr.dormitory } })} className="p-1 text-gray-500 hover:text-brand-500">
                                    <PlusIcon className="w-4 h-4" />
                                  </button>
                                )}
                                {canDeleteQr && !qr.student_id && (
                                  <button onClick={() => openDeleteQrFlow(qr)} className="p-1 text-red-500 hover:text-red-700">
                                    <TrashBinIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4 px-1">
                {qrCodes.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                    {statusText}: tidak ada data
                  </div>
                ) : (
                  qrCodes.map((qr) => (
                    <div
                      key={qr.id}
                      className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-white/[0.03] transition-all active:scale-[0.98]"
                    >
                      {/* Top Section: QR & Primary Info */}
                      <div className="flex items-center gap-4">
                        {/* QR Code Container */}
                        <div className="shrink-0 rounded-xl border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                          <QRCodeSVG
                            value={qr.token_qr}
                            size={60}
                            level="M"
                            className="dark:opacity-90"
                          />
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold font-mono text-brand-600 dark:text-brand-400">
                              {qr.unique_code || "—"}
                            </span>
                            {assignedBadge(qr)}
                          </div>

                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {qr.student ? qr.student.fullname : "Belum ada santri"}
                          </h4>

                          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="truncate">{qr.dormitory || "Tanpa Asrama"}</span>
                            {qr.qr_number && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                                <span>#{qr.qr_number}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="my-4 h-px w-full bg-gray-100 dark:bg-white/5" />

                      {/* Action Buttons Row */}
                      <div className="flex items-center gap-2">
                        {!qr.student_id ? (
                          <button
                            type="button"
                            onClick={() => openAssignFlow(qr)}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/20 active:bg-brand-600 transition-colors touch-manipulation"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            Assign Santri
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReleaseQrCode(qr);
                              openRelease();
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 active:bg-red-100 dark:bg-red-900/10 dark:text-red-400 transition-colors touch-manipulation"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                            </svg>
                            Release
                          </button>
                        )}

                        {/* Secondary Actions */}
                        <div className="flex items-center gap-1.5 ml-1">
                          {canCreateQr && qr.dormitory && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate("/qr-codes/edit", {
                                  state: { dormitory: qr.dormitory },
                                })
                              }
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                              title="Tambah QR (Asrama)"
                            >
                              <PlusIcon className="w-4.5 h-4.5" />
                            </button>
                          )}

                          {canDeleteQr && !qr.student_id && (
                            <button
                              type="button"
                              onClick={() => openDeleteQrFlow(qr)}
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                              title="Hapus QR"
                            >
                              <TrashBinIcon className="w-4.5 h-4.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-5">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
                    Menampilkan {(page - 1) * pagination.limit + 1} -{" "}
                    {Math.min(page * pagination.limit, pagination.total)} dari{" "}
                    {pagination.total}
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
                      onClick={() =>
                        setPage((p) => Math.min(pagination.totalPages, p + 1))
                      }
                      disabled={page === pagination.totalPages}
                      className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700 touch-manipulation"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </ComponentCard>
      </div>

      {/* Delete QR Confirm */}
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        onConfirm={() => void handleDeleteQr()}
        title="Hapus QR Tas?"
        message={
          deleteQrCode ? (
            <>
              QR <strong className="text-gray-800 dark:text-white">{deleteQrCode.unique_code || deleteQrCode.token_qr}</strong>{" "}
              akan dihapus permanen.
            </>
          ) : (
            "QR akan dihapus."
          )
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
        isLoading={isQrCrudLoading}
      />

      {/* Assign Modal */}
      <Modal isOpen={isAssignOpen} onClose={closeAssign} className="max-w-2xl">
        <div className="p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Assign QR Tas
          </h2>

          {assignQrCode && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Kode QR
              </div>
              <div className="mt-1 font-mono text-sm break-all">
                {assignQrCode.unique_code || assignQrCode.token_qr}
              </div>
            </div>
          )}

          <div className="mt-4">
            <Label>Pilih Santri</Label>
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Cari nama santri..."
            />
          </div>

          <div className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {isLoadingStudents ? (
              <div className="p-4">
                <TableSkeleton rows={6} columns={1} showAvatar={false} />
              </div>
            ) : students.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Tidak ada santri ditemukan.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors touch-manipulation ${selectedStudentId === s.id
                      ? "bg-brand-50 dark:bg-brand-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {s.fullname}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {s.student_number}
                        </div>
                      </div>
                      {selectedStudentId === s.id && (
                        <Badge size="sm" color="success">
                          Dipilih
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeAssign}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={!assignQrCode || !selectedStudentId || isLoadingStudents}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Simpan
            </button>
          </div>
        </div>
      </Modal>

      {/* Release Confirm */}
      <ConfirmModal
        isOpen={isReleaseOpen}
        onClose={closeRelease}
        onConfirm={() => void handleRelease()}
        title="Release QR Tas?"
        message={
          releaseQrCode
            ? `QR ini akan dikosongkan (student_id = NULL).\nKode QR: ${releaseQrCode.unique_code || releaseQrCode.token_qr}`
            : "QR akan dilepas."
        }
        confirmText="Release"
        confirmButtonColor="danger"
      />
    </>
  );
}

