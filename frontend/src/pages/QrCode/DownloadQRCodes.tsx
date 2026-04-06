import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TableSkeleton from "../../components/common/TableSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useToast } from "../../context/ToastContext";
import { dormitoryAPI, qrCodeAPI } from "../../utils/api";
import {
  buildQrZipBlob,
  downloadSingleQrLabelPng,
  inferUniqueCodePrefix,
  QrZipRow,
  triggerBrowserDownload,
  uniqueCodeInNumericRange,
  uniqueCodeSuffixNumber,
} from "../../utils/qrDownloadZip";

interface DormitoryOption {
  id: string;
  name: string;
}

interface QrRow extends QrZipRow {
  dormitory: string | null;
  student_id: string | null;
}

async function fetchAllDormitories(): Promise<DormitoryOption[]> {
  const all: DormitoryOption[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await dormitoryAPI.getAllDormitories({ page, limit: 100 });
    if (!res.success || !res.data) break;
    all.push(...(res.data.dormitories as DormitoryOption[]));
    totalPages = res.data.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return all;
}

async function fetchAllQrCodesForDormitory(dormitoryName: string): Promise<QrRow[]> {
  const all: QrRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await qrCodeAPI.getAllQRCodes({
      page,
      limit: 100,
      dormitory: dormitoryName,
    });
    if (!res.success || !res.data) break;
    all.push(...(res.data.qr_codes as QrRow[]));
    totalPages = res.data.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return all;
}

function parseOptionalPositiveInt(raw: string): { n: number | null; error: string | null } {
  const t = raw.trim();
  if (!t) return { n: null, error: null };
  if (!/^\d+$/.test(t)) return { n: null, error: "Hanya angka (0–9)" };
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return { n: null, error: "Tidak valid" };
  return { n, error: null };
}

function formatUniquePreview(prefix: string, num: number | null): string {
  if (num === null) return "…";
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

export default function DownloadQRCodes() {
  const { success, error: showError } = useToast();

  const [dormitories, setDormitories] = useState<DormitoryOption[]>([]);
  const [loadingDorms, setLoadingDorms] = useState(true);
  const [dormError, setDormError] = useState<string | null>(null);

  const [selectedDormitory, setSelectedDormitory] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [rawList, setRawList] = useState<QrRow[]>([]);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoadingDorms(true);
      setDormError(null);
      try {
        const list = await fetchAllDormitories();
        setDormitories(list);
      } catch (e: unknown) {
        setDormError(e instanceof Error ? e.message : "Gagal memuat asrama");
        setDormitories([]);
      } finally {
        setLoadingDorms(false);
      }
    })();
  }, []);

  useEffect(() => {
    setRawList([]);
    setLoadError(null);
  }, [selectedDormitory]);

  const inferredPrefix = useMemo(
    () => inferUniqueCodePrefix(rawList.map((q) => q.unique_code)),
    [rawList],
  );

  const fromParsed = useMemo(() => parseOptionalPositiveInt(rangeFrom), [rangeFrom]);
  const toParsed = useMemo(() => parseOptionalPositiveInt(rangeTo), [rangeTo]);
  const rangeInvalid = Boolean(fromParsed.error || toParsed.error);
  const rangeActive = fromParsed.n !== null || toParsed.n !== null;

  const filteredList = useMemo(() => {
    if (rangeInvalid) return [];
    const list = rawList.filter((qr) =>
      uniqueCodeInNumericRange(qr.unique_code, inferredPrefix, fromParsed.n, toParsed.n),
    );
    return [...list].sort((a, b) => {
      if (inferredPrefix) {
        const na = uniqueCodeSuffixNumber(a.unique_code, inferredPrefix);
        const nb = uniqueCodeSuffixNumber(b.unique_code, inferredPrefix);
        if (na !== null && nb !== null && na !== nb) return na - nb;
        if (na !== null && nb === null) return -1;
        if (na === null && nb !== null) return 1;
      }
      const ca = (a.unique_code ?? "").trim();
      const cb = (b.unique_code ?? "").trim();
      if (ca !== cb) return ca.localeCompare(cb, undefined, { numeric: true });
      return a.id.localeCompare(b.id);
    });
  }, [rawList, inferredPrefix, fromParsed.n, fromParsed.error, toParsed.n, toParsed.error, rangeInvalid]);

  useEffect(() => {
    setSelectedIds(new Set(filteredList.map((q) => q.id)));
  }, [filteredList]);

  const handleLoadQr = async () => {
    const dorm = selectedDormitory.trim();
    if (!dorm) {
      showError("Pilih asrama terlebih dahulu.");
      return;
    }
    setLoadingQr(true);
    setLoadError(null);
    setRawList([]);
    try {
      const list = await fetchAllQrCodesForDormitory(dorm);
      setRawList(list);
      if (list.length === 0) {
        showError("Tidak ada QR untuk asrama ini.");
      } else {
        success(`Memuat ${list.length} QR dari "${dorm}".`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal memuat QR.";
      setLoadError(msg);
      showError(msg);
    } finally {
      setLoadingQr(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredList.map((q) => q.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedRows = useMemo(
    () => filteredList.filter((q) => selectedIds.has(q.id)),
    [filteredList, selectedIds],
  );

  const handleDownloadOne = async (qr: QrRow) => {
    setDownloadingId(qr.id);
    try {
      await downloadSingleQrLabelPng(qr);
      success("PNG berhasil diunduh.");
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal mengunduh PNG.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleZipSelected = async () => {
    if (selectedRows.length === 0) {
      showError("Pilih minimal satu QR, atau sesuaikan rentang unique_code.");
      return;
    }
    setZipping(true);
    try {
      const blob = await buildQrZipBlob(selectedRows);
      const safeDorm = selectedDormitory.trim().replace(/[/\\:*?"<>|]/g, "_").slice(0, 40) || "asrama";
      triggerBrowserDownload(
        blob,
        `qr-tas-${safeDorm}-${selectedRows.length}-label.zip`,
      );
      success(`ZIP berhasil diunduh (${selectedRows.length} file).`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal membuat ZIP.");
    } finally {
      setZipping(false);
    }
  };

  const someWithoutMatchingPrefix = inferredPrefix
    ? rawList.some((q) => uniqueCodeSuffixNumber(q.unique_code, inferredPrefix) === null)
    : false;
  const rangeBlockedNoPrefix = rangeActive && !inferredPrefix && rawList.length > 0;

  return (
    <>
      <PageMeta title="Unduh label QR" description="Unduh gambar QR dengan kode unik per asrama" />
      <PageBreadcrumb pageTitle="Unduh label QR" />

      <div className="space-y-6">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <Link to="/qr-codes" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            ← Kembali ke QR Tas
          </Link>
        </div>

        <ComponentCard title="Pengaturan unduh">
          {dormError && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              {dormError}
            </div>
          )}

          <div className="space-y-6">
            {/* Dormitory Selection Grid */}
            <div>
              <Label className="mb-3 block text-sm font-bold text-gray-700 dark:text-gray-300">Pilih Asrama</Label>
              {loadingDorms ? (
                <div className="flex gap-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 w-24 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dormitories.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDormitory(d.name)}
                      className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                        selectedDormitory === d.name
                          ? "bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/20"
                          : "bg-white border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                  {dormitories.length === 0 && !loadingDorms && (
                    <p className="text-sm text-gray-500">Tidak ada data asrama.</p>
                  )}
                </div>
              )}
            </div>

            {/* Range Inputs Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nomor urut dari (opsional)</Label>
                <Input
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  placeholder="Contoh: 1"
                  error={Boolean(fromParsed.error)}
                  hint={fromParsed.error ?? undefined}
                  type="text"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nomor urut sampai (opsional)</Label>
                <Input
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  placeholder="Contoh: 50"
                  error={Boolean(toParsed.error)}
                  hint={toParsed.error ?? undefined}
                  type="text"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleLoadQr()}
                disabled={loadingQr || !selectedDormitory.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-brand-500 rounded-xl hover:bg-brand-600 shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {loadingQr ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Memuat…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Muat QR asrama
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 dark:border-white/5 pt-4">
            {rawList.length > 0 && (
              <p className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {inferredPrefix ? (
                  <span>
                    Prefix <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{inferredPrefix}</span> terdeteksi (format <span className="font-mono">{inferredPrefix}-001</span>).
                  </span>
                ) : (
                  <span className="text-amber-600">
                    Prefix 3 huruf tidak terdeteksi. Gunakan format <span className="font-mono">XXX-001</span>.
                  </span>
                )}
              </p>
            )}
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Isi hanya <strong>angka nomor urut</strong>. Huruf awal mengikuti asrama lewat data yang dimuat. Kosongkan kedua field untuk menampilkan semua QR asrama.
            </p>
          </div>
        </ComponentCard>

        <ComponentCard title="Pratinjau & unduh">
          {loadError && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              {loadError}
            </div>
          )}

          {loadingQr && rawList.length === 0 ? (
            <div className="p-5">
              <TableSkeleton rows={6} columns={5} />
            </div>
          ) : rawList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pilih asrama lalu klik &quot;Muat QR asrama&quot; untuk melihat daftar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{filteredList.length}</span>
                    <span className="text-gray-500 dark:text-gray-400">QR siap diunduh</span>
                  </div>
                  {rangeActive && inferredPrefix && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 font-mono font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      {formatUniquePreview(inferredPrefix, fromParsed.n)} — {formatUniquePreview(inferredPrefix, toParsed.n)}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={filteredList.length === 0}
                    className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 transition-all active:scale-[0.98]"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selectedIds.size === 0}
                    className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 transition-all active:scale-[0.98]"
                  >
                    Hapus Pilihan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleZipSelected()}
                    disabled={zipping || selectedRows.length === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2 text-xs font-bold rounded-xl bg-gray-900 text-white shadow-lg shadow-gray-900/10 hover:bg-black dark:bg-brand-600 dark:hover:bg-brand-700 transition-all active:scale-[0.98]"
                  >
                    {zipping ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Zipping…
                      </span>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Unduh ZIP ({selectedRows.length})
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Info Messages */}
              <div className="space-y-2">
                {rangeBlockedNoPrefix && (
                  <div className="text-[11px] text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg px-3 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Prefix tidak terdeteksi — filter rentang tidak aktif.
                  </div>
                )}
                {rangeActive && inferredPrefix && someWithoutMatchingPrefix && (
                  <div className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-lg px-3 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Beberapa QR dilewati karena prefix tidak cocok dengan <span className="font-mono font-bold">{inferredPrefix}</span>.
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      <TableCell isHeader className="px-3 py-4 text-center w-[60px]">
                        <span className="sr-only">Pilih</span>
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-bold text-gray-500 uppercase tracking-wider w-[160px]">
                        Unique Code
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-bold text-gray-500 uppercase tracking-wider w-[120px]">
                        Nomor QR
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-bold text-gray-500 uppercase tracking-wider">
                        Token Preview
                      </TableCell>
                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-bold text-gray-500 uppercase tracking-wider w-[100px]">
                        Aksi
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredList.map((qr) => (
                      <TableRow
                        key={qr.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        onClick={() => toggleOne(qr.id)}
                      >
                        <TableCell className="px-3 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(qr.id)}
                              onChange={() => toggleOne(qr.id)}
                              className="h-5 w-5 rounded-md border-gray-300 text-brand-600 focus:ring-brand-500 transition-all cursor-pointer"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center align-middle">
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                            {qr.unique_code || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center align-middle">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                             #{qr.qr_number ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center align-middle">
                          <div className="flex justify-center">
                            <span className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px]">
                              {qr.token_qr}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void handleDownloadOne(qr)}
                            disabled={downloadingId === qr.id}
                            className="inline-flex items-center justify-center px-4 py-1.5 text-[11px] font-bold text-brand-600 bg-brand-50 dark:bg-brand-500/10 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {downloadingId === qr.id ? "…" : "PNG"}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-1">
                {filteredList.map((qr) => (
                  <div
                    key={qr.id}
                    onClick={() => toggleOne(qr.id)}
                    className={`relative overflow-hidden rounded-2xl border transition-all p-4 active:scale-[0.98] ${
                      selectedIds.has(qr.id)
                        ? "border-brand-500 bg-brand-50/30 dark:bg-brand-500/5 ring-1 ring-brand-500"
                        : "border-gray-100 bg-white dark:border-white/5 dark:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(qr.id)}
                            onChange={() => toggleOne(qr.id)}
                            className="h-5 w-5 rounded-md border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold font-mono text-gray-900 dark:text-white">
                            {qr.unique_code || "—"}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Nomor: #{qr.qr_number ?? "—"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadOne(qr);
                        }}
                        disabled={downloadingId === qr.id}
                        className="shrink-0 px-4 py-2 text-xs font-bold text-brand-600 bg-white dark:bg-gray-800 border border-brand-100 dark:border-brand-500/20 rounded-xl shadow-sm active:bg-brand-50"
                      >
                        {downloadingId === qr.id ? "…" : "PNG"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
}
