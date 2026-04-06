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
import { addonAPI } from "../../utils/api";
import { PencilIcon, TrashBinIcon } from "../../icons";
import { ConfirmModal, Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";

interface Addon {
  id: string;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

type AddonModalMode = "create" | "edit";

export default function Addons() {
  const { hasPermission } = useAuth();
  const { success, error: showError } = useToast();

  const [addons, setAddons] = useState<Addon[]>([]);
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

  const canCreateAddon = hasPermission("create_addon");
  const canUpdateAddon = hasPermission("update_addon");
  const canDeleteAddon = hasPermission("delete_addon");
  const canRestoreAddon = hasPermission("restore_addon");
  const canForceDeleteAddon = hasPermission("force_delete_addon");

  const fetchAddons = async (forceLoading = false) => {
    if (forceLoading || addons.length === 0) setIsLoading(true);
    setError(null);
    try {
      const res = await addonAPI.listAddons({
        page,
        limit: 10,
        active_only: false,
        deleted_only: showDeleted,
      });
      if (res.success && res.data) {
        let filtered = res.data.addons as Addon[];
        // Frontend search filter since backend might not support search yet for addons
        if (search.trim()) {
          const s = search.toLowerCase();
          filtered = filtered.filter(
            (a) =>
              a.name.toLowerCase().includes(s) ||
              (a.description && a.description.toLowerCase().includes(s))
          );
        }
        setAddons(filtered);
        setPagination(res.data.pagination);
      } else {
        setError(res.message || "Gagal mengambil data addon");
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAddons(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, showDeleted]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void fetchAddons(true);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Create/Edit modal
  const {
    isOpen: isAddonModalOpen,
    openModal: openAddonModal,
    closeModal: closeAddonModal,
  } = useModal();
  const [modalMode, setModalMode] = useState<AddonModalMode>("create");
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    price: string;
    description: string;
    is_active: boolean;
  }>({
    name: "",
    price: "",
    description: "",
    is_active: true,
  });

  const openCreate = () => {
    setModalMode("create");
    setEditingAddon(null);
    setFormData({ name: "", price: "", description: "", is_active: true });
    openAddonModal();
  };

  const openEdit = (a: Addon) => {
    setModalMode("edit");
    setEditingAddon(a);
    setFormData({
      name: a.name,
      price: a.price.toString(),
      description: a.description || "",
      is_active: a.is_active,
    });
    openAddonModal();
  };

  const handleSaveAddon = async () => {
    const priceNum = parseFloat(formData.price) || 0;
    const payload = {
      name: formData.name.trim(),
      price: priceNum,
      description: formData.description.trim() || null,
      is_active: formData.is_active,
    };

    if (!payload.name) {
      showError("Nama addon wajib diisi.");
      return;
    }

    if (modalMode === "create") {
      const res = await addonAPI.createAddon(payload);
      if (!res.success) {
        showError(res.message || res.error || "Gagal membuat addon");
        return;
      }
      success("Addon berhasil dibuat.");
    } else {
      if (!editingAddon) {
        showError("Data addon untuk update tidak tersedia. Silakan coba lagi.");
        return;
      }
      const res = await addonAPI.updateAddon(editingAddon.id, payload);
      if (!res.success) {
        showError(res.message || res.error || "Gagal memperbarui addon");
        return;
      }
      success("Addon berhasil diperbarui.");
    }

    closeAddonModal();
    await fetchAddons(true);
  };

  // Delete confirm
  const {
    isOpen: isDeleteOpen,
    openModal: openDelete,
    closeModal: closeDelete,
  } = useModal();
  const [deleteTarget, setDeleteTarget] = useState<Addon | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await addonAPI.deleteAddon(deleteTarget.id);
    if (!res.success) {
      showError(res.message || res.error || "Gagal menghapus addon");
      return;
    }
    success("Addon berhasil dihapus.");
    closeDelete();
    setDeleteTarget(null);
    await fetchAddons(true);
  };

  // Restore confirm
  const {
    isOpen: isRestoreOpen,
    openModal: openRestore,
    closeModal: closeRestore,
  } = useModal();
  const [restoreTarget, setRestoreTarget] = useState<Addon | null>(null);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const res = await addonAPI.restoreAddon(restoreTarget.id);
    if (!res.success) {
      showError(res.message || res.error || "Gagal memulihkan addon");
      return;
    }
    success("Addon berhasil dipulihkan.");
    closeRestore();
    setRestoreTarget(null);
    await fetchAddons(true);
  };

  // Force Delete confirm
  const {
    isOpen: isForceDeleteOpen,
    openModal: openForceDelete,
    closeModal: closeForceDelete,
  } = useModal();
  const [forceDeleteTarget, setForceDeleteTarget] = useState<Addon | null>(null);

  const handleForceDelete = async () => {
    if (!forceDeleteTarget) return;
    const res = await addonAPI.deleteAddon(forceDeleteTarget.id, true);
    if (!res.success) {
      showError(res.message || res.error || "Gagal menghapus permanen addon");
      return;
    }
    success("Addon berhasil dihapus secara permanen.");
    closeForceDelete();
    setForceDeleteTarget(null);
    await fetchAddons(true);
  };

  const emptyStateText = useMemo(() => {
    if (isLoading) return "Memuat…";
    return search ? `Tidak ada addon ${showDeleted ? "terhapus " : ""}yang ditemukan.` : `Belum ada addon ${showDeleted ? "terhapus" : ""}.`;
  }, [isLoading, search, showDeleted]);

  return (
    <>
      <PageMeta title="Layanan Tambahan (Add-on)" description="Kelola data layanan tambahan order" />
      <PageBreadcrumb pageTitle="Add-on" />

      <div className="space-y-6">
        <ComponentCard title={showDeleted ? "Tong Sampah Add-on" : "Daftar Add-on"}>
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
                placeholder="Cari addon (nama/desc)..."
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
                className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors border ${showDeleted
                    ? "bg-gray-100 text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-700"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-transparent dark:text-gray-400 dark:border-gray-800 dark:hover:bg-gray-900"
                  }`}
              >
                {showDeleted ? "Add-on Aktif" : "Add-on Terhapus"}
              </button>

              {!showDeleted && canCreateAddon && (
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
                  Tambah Add-on
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            {isLoading && addons.length === 0 ? (
              <div className="p-4">
                <TableSkeleton rows={10} columns={5} />
              </div>
            ) : addons.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                {emptyStateText}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[200px]">
                        Nama Add-on
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[130px]">
                        Harga (Rp)
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400">
                        Deskripsi
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[120px]">
                        Status
                      </TableCell>
                      {/* Lebar kolom aksi ditambah menjadi 220px agar tombol restore/delete tidak terpotong */}
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[220px]">
                        Aksi
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {addons.map((a) => {
                      const isClickable = !showDeleted && canUpdateAddon;
                      return (
                        <TableRow
                          key={a.id}
                          className={`transition-colors ${
                            isClickable 
                              ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-50/5" 
                              : "hover:bg-gray-50/50"
                          }`}
                          onClick={() => {
                            if (isClickable) openEdit(a);
                          }}
                        >
                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="font-medium text-gray-800 text-sm dark:text-white/90">
                              {a.name}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="text-gray-800 text-sm dark:text-white/90 font-mono">
                              {a.price.toLocaleString("id-ID")}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="text-gray-500 text-sm dark:text-gray-400 italic truncate" title={a.description || ""}>
                              {a.description || "—"}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="flex justify-center">
                              <Badge size="sm" color={a.is_active ? "success" : "light"}>
                                {a.is_active ? "Aktif" : "Non-aktif"}
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {!showDeleted ? (
                                <>
                                  {canUpdateAddon && (
                                    <button
                                      type="button"
                                      onClick={() => openEdit(a)}
                                      className="p-2 text-gray-500 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                                      title="Edit Add-on"
                                    >
                                      <PencilIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                  {canDeleteAddon && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteTarget(a);
                                        openDelete();
                                      }}
                                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                      title="Hapus Add-on"
                                    >
                                      <TrashBinIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center gap-2 w-full">
                                  {canRestoreAddon && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRestoreTarget(a);
                                        openRestore();
                                      }}
                                      className="inline-flex items-center shrink-0 gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                                      title="Pulihkan Add-on"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                      Pulihkan
                                    </button>
                                  )}
                                  {canForceDeleteAddon && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForceDeleteTarget(a);
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
            {isLoading && addons.length === 0 ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 bg-white rounded-2xl border border-gray-100 dark:bg-white/[0.03] dark:border-white/5 animate-pulse">
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/4" />
                      </div>
                      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                    </div>
                    <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-xl w-full" />
                  </div>
                ))}
              </div>
            ) : addons.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
                {emptyStateText}
              </div>
            ) : (
              addons.map((a) => {
                const isClickable = !showDeleted && canUpdateAddon;
                return (
                  <div
                    key={a.id}
                    className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-white/[0.03] transition-all ${
                      isClickable ? "cursor-pointer active:scale-[0.98] active:bg-gray-50/50 dark:active:bg-white/[0.05]" : ""
                    }`}
                    onClick={() => {
                      if (isClickable) openEdit(a);
                    }}
                  >
                    {/* Header: Name & Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">
                          {a.name}
                        </h4>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-black text-brand-600 dark:text-brand-400">
                            Rp {a.price.toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Badge size="sm" color={a.is_active ? "success" : "light"}>
                          {a.is_active ? "Aktif" : "Non-aktif"}
                        </Badge>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                      {a.description || "Tidak ada deskripsi"}
                    </p>

                    {/* Actions Row */}
                    <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!showDeleted ? (
                        <div className="flex w-full items-center gap-2">
                          {canUpdateAddon && (
                            <button
                              type="button"
                              onClick={() => openEdit(a)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-600 active:bg-brand-100 dark:bg-brand-900/10 dark:text-brand-400 transition-colors touch-manipulation"
                            >
                              <PencilIcon className="w-4 h-4" />
                              Edit Layanan
                            </button>
                          )}
                          {canDeleteAddon && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTarget(a);
                                openDelete();
                              }}
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:active:bg-red-900/20 transition-colors touch-manipulation"
                              title="Hapus layanan"
                            >
                              <TrashBinIcon className="w-4.5 h-4.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex w-full gap-2">
                          {canRestoreAddon && (
                            <button
                              type="button"
                              onClick={() => {
                                setRestoreTarget(a);
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
                          {canDeleteAddon && (
                            <button
                              type="button"
                              onClick={() => {
                                setForceDeleteTarget(a);
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
      <Modal isOpen={isAddonModalOpen} onClose={closeAddonModal} className="max-w-lg">
        <div className="p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {modalMode === "create" ? "Tambah Add-on" : "Edit Add-on"}
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <Label>Nama <span className="text-error-500">*</span></Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Pewangi Premium"
              />
            </div>
            <div>
              <Label>Harga (Rp) <span className="text-error-500">*</span></Label>
              <Input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                placeholder="2000"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
              />
              <Label htmlFor="is_active" className="!mb-0 cursor-pointer">Status Aktif</Label>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Keterangan opsional..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-5 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeAddonModal}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 touch-manipulation"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAddon()}
              disabled={modalMode === "edit" && !editingAddon}
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
        title="Hapus Add-on?"
        message={
          deleteTarget ? (
            <>
              Add-on <strong className="text-gray-800 dark:text-white">{deleteTarget.name}</strong> akan
              dihapus.
            </>
          ) : (
            "Add-on akan dihapus."
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
        title="Pulihkan Add-on?"
        message={
          restoreTarget ? (
            <>
              Add-on <strong className="text-gray-800 dark:text-white">{restoreTarget.name}</strong> akan
              dipulihkan ke daftar aktif.
            </>
          ) : (
            "Add-on akan dipulihkan."
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
        title="Hapus Permanen Add-on?"
        message={
          forceDeleteTarget ? (
            <div className="space-y-2">
              <p>
                Add-on <strong className="text-gray-800 dark:text-white">{forceDeleteTarget.name}</strong> akan
                dihapus secara <span className="text-red-600 font-bold underline">permanen</span>.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
                Tindakan ini tidak dapat dibatalkan dan data tidak dapat dipulihkan lagi.
              </p>
            </div>
          ) : (
            "Add-on akan dihapus secara permanen."
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
