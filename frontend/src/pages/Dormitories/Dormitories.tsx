import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { dormitoryAPI } from "../../utils/api";
import { PencilIcon, TrashBinIcon } from "../../icons";
import { ConfirmModal, Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";

interface Dormitory {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type DormitoryModalMode = "create" | "edit";

export default function Dormitories() {
  const { hasPermission } = useAuth();
  const { success, error: showError } = useToast();
  // permissions optional: resource is typically admin-only, but backend currently doesn't enforce specific ones

  const [dormitories, setDormitories] = useState<Dormitory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showDeleted, setShowDeleted] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const canCreateDormitory = hasPermission("create_dormitory");
  const canUpdateDormitory = hasPermission("update_dormitory");
  const canDeleteDormitory = hasPermission("delete_dormitory");
  const canRestoreDormitory = hasPermission("restore_dormitory");
  const canForceDeleteDormitory = hasPermission("force_delete_dormitory");

  const fetchDormitories = async (forceLoading = false) => {
    if (forceLoading || dormitories.length === 0) setIsLoading(true);
    setError(null);
    try {
      const res = await dormitoryAPI.getAllDormitories({
        page,
        limit: 10,
        search: search.trim() || undefined,
        deleted_only: showDeleted,
      });
      if (res.success && res.data) {
        setDormitories(res.data.dormitories as Dormitory[]);
        setPagination(res.data.pagination);
      } else {
        setError(res.message || "Gagal mengambil data asrama");
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDormitories(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, showDeleted]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void fetchDormitories(true);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Create/Edit modal
  const {
    isOpen: isDormitoryModalOpen,
    openModal: openDormitoryModal,
    closeModal: closeDormitoryModal,
  } = useModal();
  const [modalMode, setModalMode] = useState<DormitoryModalMode>("create");
  const [editingDormitory, setEditingDormitory] = useState<Dormitory | null>(null);
  const [formData, setFormData] = useState<{ name: string; description: string }>({
    name: "",
    description: "",
  });

  const openCreate = () => {
    setModalMode("create");
    setEditingDormitory(null);
    setFormData({ name: "", description: "" });
    openDormitoryModal();
  };

  const openEdit = (d: Dormitory) => {
    setModalMode("edit");
    setEditingDormitory(d);
    setFormData({
      name: d.name,
      description: d.description || "",
    });
    openDormitoryModal();
  };

  const handleSaveDormitory = async () => {
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
    };
    if (!payload.name) {
      showError("Nama asrama wajib diisi.");
      return;
    }

    if (modalMode === "create") {
      const res = await dormitoryAPI.createDormitory(payload);
      if (!res.success) {
        showError(res.message || res.error || "Gagal membuat asrama");
        return;
      }
      success("Asrama berhasil dibuat.");
    } else {
      if (!editingDormitory) {
        showError("Data asrama untuk update tidak tersedia. Silakan coba lagi.");
        return;
      }
      const res = await dormitoryAPI.updateDormitory(editingDormitory.id, payload);
      if (!res.success) {
        showError(res.message || res.error || "Gagal memperbarui asrama");
        return;
      }
      success("Asrama berhasil diperbarui.");
    }

    closeDormitoryModal();
    await fetchDormitories(true);
  };

  // Delete confirm
  const {
    isOpen: isDeleteOpen,
    openModal: openDelete,
    closeModal: closeDelete,
  } = useModal();
  const [deleteTarget, setDeleteTarget] = useState<Dormitory | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await dormitoryAPI.deleteDormitory(deleteTarget.id);
    if (!res.success) {
      showError(res.message || res.error || "Gagal menghapus asrama");
      return;
    }
    success("Asrama berhasil dihapus.");
    closeDelete();
    setDeleteTarget(null);
    await fetchDormitories(true);
  };

  // Restore confirm
  const {
    isOpen: isRestoreOpen,
    openModal: openRestore,
    closeModal: closeRestore,
  } = useModal();
  const [restoreTarget, setRestoreTarget] = useState<Dormitory | null>(null);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const res = await dormitoryAPI.restoreDormitory(restoreTarget.id);
    if (!res.success) {
      showError(res.message || res.error || "Gagal memulihkan asrama");
      return;
    }
    success("Asrama berhasil dipulihkan.");
    closeRestore();
    setRestoreTarget(null);
    await fetchDormitories(true);
  };

  // Force Delete confirm
  const {
    isOpen: isForceDeleteOpen,
    openModal: openForceDelete,
    closeModal: closeForceDelete,
  } = useModal();
  const [forceDeleteTarget, setForceDeleteTarget] = useState<Dormitory | null>(null);

  const handleForceDelete = async () => {
    if (!forceDeleteTarget) return;
    const res = await dormitoryAPI.deleteDormitory(forceDeleteTarget.id, true);
    if (!res.success) {
      showError(res.message || res.error || "Gagal menghapus permanen asrama");
      return;
    }
    success("Asrama berhasil dihapus secara permanen.");
    closeForceDelete();
    setForceDeleteTarget(null);
    await fetchDormitories(true);
  };

  const emptyStateText = useMemo(() => {
    if (isLoading) return "Memuat…";
    return search ? `Tidak ada asrama ${showDeleted ? "terhapus " : ""}yang ditemukan.` : `Belum ada asrama ${showDeleted ? "terhapus" : ""}.`;
  }, [isLoading, search, showDeleted]);

  return (
    <>
      <PageMeta title="Asrama" description="Kelola data asrama" />
      <PageBreadcrumb pageTitle="Asrama" />

      <div className="space-y-6">
        <ComponentCard title={showDeleted ? "Tong Sampah Asrama" : "Daftar Asrama"}>
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Search + actions */}
          <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Cari asrama (nama/desc)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 sm:h-11 rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleted(!showDeleted);
                  setPage(1);
                }}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors border ${
                  showDeleted
                    ? "bg-gray-100 text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-700"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-transparent dark:text-gray-400 dark:border-gray-800 dark:hover:bg-gray-900"
                }`}
              >
                {showDeleted ? "Asrama Aktif" : "Asrama Terhapus"}
              </button>

              {!showDeleted && canCreateDormitory && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation"
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Asrama
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            {isLoading && dormitories.length === 0 ? (
              <div className="p-4">
                <TableSkeleton rows={10} columns={4} />
              </div>
            ) : dormitories.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                {emptyStateText}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[200px]">
                        Nama Asrama
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400">
                        Deskripsi
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[120px]">
                        Status
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[220px]">
                        Aksi
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {dormitories.map((d) => {
                      const isClickable = !showDeleted && canUpdateDormitory;
                      return (
                        <TableRow
                          key={d.id}
                          className={`transition-colors ${
                            isClickable 
                              ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-50/5" 
                              : "hover:bg-gray-50/50"
                          }`}
                          onClick={() => {
                            if (isClickable) openEdit(d);
                          }}
                        >
                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="font-medium text-gray-800 text-sm dark:text-white/90">
                              {d.name}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="text-gray-500 text-sm dark:text-gray-400 italic">
                              {d.description || "—"}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="flex justify-center">
                              <Badge size="sm" color={showDeleted ? "error" : "success"}>
                                {showDeleted ? "Terhapus" : "Aktif"}
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {!showDeleted ? (
                                <>
                                  {canUpdateDormitory && (
                                    <button
                                      type="button"
                                      onClick={() => openEdit(d)}
                                      className="p-1.5 text-gray-500 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                                      title="Edit Asrama"
                                    >
                                      <PencilIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                  {canDeleteDormitory && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteTarget(d);
                                        openDelete();
                                      }}
                                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                      title="Hapus Asrama"
                                    >
                                      <TrashBinIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center gap-2 w-full">
                                  {canRestoreDormitory && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRestoreTarget(d);
                                        openRestore();
                                      }}
                                      className="inline-flex items-center shrink-0 gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                                      title="Pulihkan Asrama"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                      Pulihkan
                                    </button>
                                  )}
                                  {canForceDeleteDormitory && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForceDeleteTarget(d);
                                        openForceDelete();
                                      }}
                                      className="inline-flex items-center shrink-0 gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                                      title="Hapus Permanen"
                                    >
                                      <TrashBinIcon className="w-3.5 h-3.5" />
                                      Hapus
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

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4 px-1">
            {isLoading && dormitories.length === 0 ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 bg-white rounded-2xl border border-gray-100 dark:bg-white/[0.03] dark:border-white/5 animate-pulse">
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
                      </div>
                      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-xl flex-1" />
                      <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-xl w-10" />
                    </div>
                  </div>
                ))}
              </div>
            ) : dormitories.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
                {emptyStateText}
              </div>
            ) : (
              dormitories.map((d) => {
                const isClickable = !showDeleted && canUpdateDormitory;
                return (
                  <div
                    key={d.id}
                    className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-white/[0.03] transition-all ${
                      isClickable ? "cursor-pointer active:scale-[0.98] active:bg-gray-50/50 dark:active:bg-white/[0.05]" : ""
                    }`}
                    onClick={() => {
                      if (isClickable) openEdit(d);
                    }}
                  >
                    {/* Header: Name & Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">
                          {d.name}
                        </h4>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                          {d.description || "Tidak ada deskripsi"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Badge size="sm" color={showDeleted ? "error" : "success"}>
                          {showDeleted ? "Terhapus" : "Aktif"}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!showDeleted ? (
                        <div className="flex w-full items-center gap-2">
                          {canUpdateDormitory && (
                            <button
                              type="button"
                              onClick={() => openEdit(d)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-600 active:bg-brand-100 dark:bg-brand-900/10 dark:text-brand-400 transition-colors touch-manipulation"
                            >
                              <PencilIcon className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {canDeleteDormitory && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTarget(d);
                                openDelete();
                              }}
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:active:bg-red-900/20 transition-colors touch-manipulation"
                              title="Hapus asrama"
                            >
                              <TrashBinIcon className="w-4.5 h-4.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex w-full gap-2">
                          {canRestoreDormitory && (
                            <button
                              type="button"
                              onClick={() => {
                                setRestoreTarget(d);
                                openRestore();
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 active:bg-emerald-700 transition-colors touch-manipulation"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Pulihkan
                            </button>
                          )}
                          {canDeleteDormitory && (
                            <button
                              type="button"
                              onClick={() => {
                                setForceDeleteTarget(d);
                                openForceDelete();
                              }}
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:active:bg-red-900/20 transition-colors touch-manipulation"
                              title="Hapus permanen"
                            >
                              <TrashBinIcon className="w-4.5 h-4.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
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
        </ComponentCard>
      </div>

      {/* Modal Create/Edit */}
      <Modal isOpen={isDormitoryModalOpen} onClose={closeDormitoryModal} className="max-w-lg">
        <div className="p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {modalMode === "create" ? "Tambah Asrama" : "Edit Asrama"}
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <Label>Nama <span className="text-error-500">*</span></Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Asrama A"
              />
            </div>
            <div>
              <Label>Deskripsi</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Keterangan opsional..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-5 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeDormitoryModal}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 touch-manipulation"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDormitory()}
              disabled={modalMode === "edit" && !editingDormitory}
              className="px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modalMode === "create" ? "Simpan" : "Update"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Delete */}
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        onConfirm={() => void handleDelete()}
        title="Hapus Asrama?"
        message={
          deleteTarget ? (
            <>
              Asrama <strong className="text-gray-800 dark:text-white">{deleteTarget.name}</strong> akan
              dihapus sementara.
            </>
          ) : (
            "Asrama akan dihapus sementara."
          )
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
      />

      {/* Modal Restore */}
      <ConfirmModal
        isOpen={isRestoreOpen}
        onClose={closeRestore}
        onConfirm={() => void handleRestore()}
        title="Pulihkan Asrama?"
        message={
          restoreTarget ? (
            <>
              Asrama <strong className="text-gray-800 dark:text-white">{restoreTarget.name}</strong> akan
              dipulihkan ke daftar aktif.
            </>
          ) : (
            "Asrama akan dipulihkan."
          )
        }
        confirmText="Pulihkan"
        cancelText="Batal"
        confirmButtonColor="primary"
        icon={
          <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
      />

      {/* Modal Force Delete */}
      <ConfirmModal
        isOpen={isForceDeleteOpen}
        onClose={closeForceDelete}
        onConfirm={() => void handleForceDelete()}
        title="Hapus Permanen Asrama?"
        message={
          forceDeleteTarget ? (
            <div className="space-y-2">
              <p>
                Asrama <strong className="text-gray-800 dark:text-white">{forceDeleteTarget.name}</strong> akan
                dihapus secara <span className="text-red-600 font-bold underline">permanen</span>.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
                Tindakan ini tidak dapat dibatalkan dan data tidak dapat dipulihkan lagi (termasuk kaitan dengan QR Code akan diputus).
              </p>
            </div>
          ) : (
            "Asrama akan dihapus secara permanen."
          )
        }
        confirmText="Hapus Permanen"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
      />
    </>
  );
}

