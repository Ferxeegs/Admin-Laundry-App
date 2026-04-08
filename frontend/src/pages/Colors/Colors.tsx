import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import TableSkeleton from "../../components/common/TableSkeleton";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { colorAPI } from "../../utils/api";
import { PencilIcon, TrashBinIcon } from "../../icons";
import { ConfirmModal, Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../context/ToastContext";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";

interface Color {
  id: string;
  name: string;
  color_code: string;
}

type ColorModalMode = "create" | "edit";

export default function Colors() {
  const { hasPermission } = useAuth();
  const { success, error: showError } = useToast();

  const [colors, setColors] = useState<Color[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const canCreateColor = hasPermission("create_color");
  const canUpdateColor = hasPermission("update_color");
  const canDeleteColor = hasPermission("delete_color");

  const fetchColors = async (forceLoading = false) => {
    if (forceLoading || colors.length === 0) setIsLoading(true);
    setError(null);
    try {
      const res = await colorAPI.getColors();
      if (res.success && res.data) {
        setColors(res.data);
      } else {
        setError(res.message || "Gagal mengambil data warna");
      }
    } catch (e: any) {
      setError(e?.message || "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchColors(false);
  }, []);

  // Filtered colors based on search
  const filteredColors = useMemo(() => {
    if (!search.trim()) return colors;
    const s = search.toLowerCase();
    return colors.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.color_code.toLowerCase().includes(s)
    );
  }, [colors, search]);

  // Create/Edit modal
  const {
    isOpen: isColorModalOpen,
    openModal: openColorModal,
    closeModal: closeColorModal,
  } = useModal();
  const [modalMode, setModalMode] = useState<ColorModalMode>("create");
  const [editingColor, setEditingColor] = useState<Color | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color_code: "",
  });

  const openCreate = () => {
    setModalMode("create");
    setEditingColor(null);
    setFormData({ name: "", color_code: "" });
    openColorModal();
  };

  const openEdit = (c: Color) => {
    setModalMode("edit");
    setEditingColor(c);
    setFormData({
      name: c.name,
      color_code: c.color_code,
    });
    openColorModal();
  };

  const handleSaveColor = async () => {
    const payload = {
      name: formData.name.trim(),
      color_code: formData.color_code.trim().toUpperCase(),
    };

    if (!payload.name || !payload.color_code) {
      showError("Nama dan kode warna wajib diisi.");
      return;
    }

    if (modalMode === "create") {
      const res = await colorAPI.createColor(payload);
      if (!res.success) {
        showError(res.message || "Gagal membuat warna");
        return;
      }
      success("Warna berhasil dibuat.");
    } else {
      if (!editingColor) return;
      const res = await colorAPI.updateColor(editingColor.id, payload);
      if (!res.success) {
        showError(res.message || "Gagal memperbarui warna");
        return;
      }
      success("Warna berhasil diperbarui.");
    }

    closeColorModal();
    await fetchColors(true);
  };

  // Delete confirm
  const {
    isOpen: isDeleteOpen,
    openModal: openDelete,
    closeModal: closeDelete,
  } = useModal();
  const [deleteTarget, setDeleteTarget] = useState<Color | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await colorAPI.deleteColor(deleteTarget.id);
      if (!res.success) {
        showError(res.message || "Gagal menghapus warna");
        return;
      }
      success("Warna berhasil dihapus.");
      closeDelete();
      setDeleteTarget(null);
      await fetchColors(true);
    } catch (error: any) {
      showError(error.response?.data?.detail || "Gagal menghapus warna");
    }
  };

  const emptyStateText = useMemo(() => {
    if (isLoading) return "Memuat…";
    return search ? "Tidak ada warna yang ditemukan." : "Belum ada data warna.";
  }, [isLoading, search]);

  return (
    <>
      <PageMeta title="Manajemen Warna" description="Kelola warna untuk kategorisasi QR Code" />
      <PageBreadcrumb pageTitle="Warna" />

      <div className="space-y-6">
        <ComponentCard title="Daftar Warna QR">
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
                placeholder="Cari warna (nama/kode)..."
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
              {canCreateColor && (
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
                  Tambah Warna
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            {isLoading && colors.length === 0 ? (
              <div className="p-4">
                <TableSkeleton rows={8} columns={3} />
              </div>
            ) : filteredColors.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                {emptyStateText}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400">
                        Nama Warna
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[200px]">
                        Kode (Singkatan)
                      </TableCell>
                      <TableCell isHeader className="px-5 py-4 text-center text-theme-sm font-medium text-gray-500 dark:text-gray-400 w-[150px]">
                        Aksi
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {filteredColors.map((c) => {
                      const isClickable = canUpdateColor;
                      return (
                        <TableRow
                          key={c.id}
                          className={`transition-colors ${
                            isClickable 
                              ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-50/5" 
                              : "hover:bg-gray-50/50"
                          }`}
                          onClick={() => {
                            if (isClickable) openEdit(c);
                          }}
                        >
                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="font-medium text-gray-800 text-sm dark:text-white/90">
                              {c.name}
                            </div>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle font-mono">
                            <span className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {c.color_code}
                            </span>
                          </TableCell>

                          <TableCell className="px-5 py-4 text-center align-middle">
                            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {canUpdateColor && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(c)}
                                  className="p-2 text-gray-500 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                                  title="Edit Warna"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                              )}
                              {canDeleteColor && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteTarget(c);
                                    openDelete();
                                  }}
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                  title="Hapus Warna"
                                >
                                  <TrashBinIcon className="w-4 h-4" />
                                </button>
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
            {isLoading && colors.length === 0 ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 bg-white rounded-2xl border border-gray-100 dark:bg-white/[0.03] dark:border-white/5 animate-pulse">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />
                    <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-xl w-full" />
                  </div>
                ))}
              </div>
            ) : filteredColors.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
                {emptyStateText}
              </div>
            ) : (
              filteredColors.map((c) => {
                const isClickable = canUpdateColor;
                return (
                  <div
                    key={c.id}
                    className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-white/[0.03] transition-all ${
                      isClickable ? "cursor-pointer active:scale-[0.98] active:bg-gray-50/50 dark:active:bg-white/[0.05]" : ""
                    }`}
                    onClick={() => {
                      if (isClickable) openEdit(c);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">
                          {c.name}
                        </h4>
                        <div className="mt-1">
                          <span className="text-xs font-mono font-black text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/10 px-2 py-0.5 rounded">
                            {c.color_code}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex w-full items-center gap-2">
                        {canUpdateColor && (
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-600 active:bg-brand-100 dark:bg-brand-900/10 dark:text-brand-400 transition-colors touch-manipulation"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit Warna
                          </button>
                        )}
                        {canDeleteColor && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(c);
                              openDelete();
                            }}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:active:bg-red-900/20 transition-colors touch-manipulation"
                            title="Hapus warna"
                          >
                            <TrashBinIcon className="w-4.5 h-4.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ComponentCard>
      </div>

      {/* Modal Create/Edit */}
      <Modal isOpen={isColorModalOpen} onClose={closeColorModal} className="max-w-lg">
        <div className="p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {modalMode === "create" ? "Tambah Warna" : "Edit Warna"}
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <Label>Nama Warna <span className="text-error-500">*</span></Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Biru"
              />
            </div>
            <div>
              <Label>Kode / Singkatan <span className="text-error-500">*</span></Label>
              <Input
                value={formData.color_code}
                onChange={(e) => setFormData((p) => ({ ...p, color_code: e.target.value.toUpperCase() }))}
                placeholder="Contoh: BIR"
                maxLength={7}
              />
              <p className="mt-1 text-xs text-gray-500">Maksimal 7 karakter. Singkatan ini akan muncul pada label QR.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-5 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeColorModal}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 touch-manipulation"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSaveColor()}
              disabled={modalMode === "edit" && !editingColor}
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
        title="Hapus Warna?"
        message={
          deleteTarget ? (
            <>
              Warna <strong className="text-gray-800 dark:text-white">{deleteTarget.name}</strong> akan
              dihapus. Pastikan warna ini tidak lagi digunakan oleh QR Code manapun.
            </>
          ) : (
            "Warna akan dihapus."
          )
        }
        confirmText="Hapus"
        cancelText="Batal"
        confirmButtonColor="danger"
        icon={<TrashBinIcon className="w-6 h-6" />}
      />
    </>
  );
}
