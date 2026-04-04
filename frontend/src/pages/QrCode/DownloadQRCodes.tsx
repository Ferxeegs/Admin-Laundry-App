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
            <div className="mb-3 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              {dormError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Asrama</Label>
              <select
                value={selectedDormitory}
                onChange={(e) => setSelectedDormitory(e.target.value)}
                disabled={loadingDorms}
                className="mt-1.5 w-full h-11 px-3 text-sm rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white/90"
                aria-label="Pilih asrama"
              >
                <option value="">{loadingDorms ? "Memuat asrama…" : "— Pilih asrama —"}</option>
                {dormitories.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Nomor urut dari (opsional)</Label>
              <Input
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                placeholder="Contoh: 1"
                className="mt-1.5"
                error={Boolean(fromParsed.error)}
                hint={fromParsed.error ?? undefined}
                type="text"
              />
            </div>
            <div>
              <Label>Nomor urut sampai (opsional)</Label>
              <Input
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                placeholder="Contoh: 50"
                className="mt-1.5"
                error={Boolean(toParsed.error)}
                hint={toParsed.error ?? undefined}
                type="text"
              />
            </div>
          </div>

          {rawList.length > 0 && (
            <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">
              {inferredPrefix ? (
                <>
                  Prefix <span className="font-mono font-semibold">{inferredPrefix}</span> diambil dari data QR
                  asrama ini (format <span className="font-mono">{inferredPrefix}-001</span>).
                </>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  Belum terdeteksi prefix 3 huruf dari unique_code — pastikan QR memakai format{" "}
                  <span className="font-mono">XXX-001</span>.
                </span>
              )}
            </p>
          )}

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Isi hanya <strong>angka nomor urut</strong> (tanpa tanda hubung atau huruf). Huruf awal mengikuti asrama
            lewat data yang dimuat. Kosongkan kedua field untuk menampilkan semua QR asrama.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleLoadQr()}
              disabled={loadingQr || !selectedDormitory.trim()}
              className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              {loadingQr ? "Memuat…" : "Muat QR asrama"}
            </button>
          </div>
        </ComponentCard>

        <ComponentCard title="Pratinjau & unduh">
          {loadError && (
            <div className="mb-3 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              {loadError}
            </div>
          )}

          {loadingQr && rawList.length === 0 ? (
            <div className="p-5">
              <TableSkeleton rows={6} columns={5} />
            </div>
          ) : rawList.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              Pilih asrama lalu klik &quot;Muat QR asrama&quot; untuk melihat daftar.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600 dark:text-gray-400">
                <div>
                  <span className="font-medium text-gray-800 dark:text-white">{filteredList.length}</span> QR
                  ditampilkan
                  {rawList.length !== filteredList.length && (
                    <span>
                      {" "}
                      (dari {rawList.length} total{rangeActive ? ", setelah filter rentang" : ""})
                    </span>
                  )}
                  {rangeActive && inferredPrefix && (
                    <span className="block text-xs mt-1">
                      Filter nomor →{" "}
                      <span className="font-mono">
                        {formatUniquePreview(inferredPrefix, fromParsed.n)} —{" "}
                        {formatUniquePreview(inferredPrefix, toParsed.n)}
                      </span>
                    </span>
                  )}
                  {rangeActive && !inferredPrefix && rawList.length > 0 && (
                    <span className="block text-xs mt-1 text-amber-700 dark:text-amber-400">
                      Isi nomor membutuhkan prefix dari data — tidak terdeteksi.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={filteredList.length === 0}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    Pilih semua tampilan
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    Kosongkan pilihan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleZipSelected()}
                    disabled={zipping || selectedRows.length === 0}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-800 text-white hover:bg-gray-900 dark:bg-brand-600 dark:hover:bg-brand-700 disabled:opacity-50"
                  >
                    {zipping ? "Membuat ZIP…" : `Unduh ZIP (${selectedRows.length})`}
                  </button>
                </div>
              </div>

              {rangeBlockedNoPrefix && (
                <p className="mb-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  Rentang nomor tidak bisa diterapkan: tidak ada prefix unik terdeteksi dari unique_code di asrama ini.
                </p>
              )}

              {rangeActive && inferredPrefix && someWithoutMatchingPrefix && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Beberapa QR tidak memakai prefix <span className="font-mono">{inferredPrefix}</span> sehingga tidak
                  ikut filter rentang.
                </p>
              )}

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Table className="w-full table-fixed border-collapse">
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                    <TableRow>
                      {/* Checkbox Column */}
                      <TableCell isHeader className="px-3 py-4 text-center w-[50px]">
                        <span className="sr-only">Pilih</span>
                      </TableCell>

                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-medium text-gray-500 dark:text-gray-400 w-[160px]">
                        Unique Code
                      </TableCell>

                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-medium text-gray-500 dark:text-gray-400 w-[120px]">
                        Nomor QR
                      </TableCell>

                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Token
                      </TableCell>

                      <TableCell isHeader className="px-4 py-4 text-center text-theme-xs font-medium text-gray-500 dark:text-gray-400 w-[100px]">
                        Unduh
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="px-4 py-10 text-center text-gray-500">
                          {rangeInvalid
                            ? "Perbaiki input nomor (hanya angka)."
                            : rangeBlockedNoPrefix
                              ? "Tidak bisa memfilter: prefix unique_code tidak terdeteksi."
                              : "Tidak ada QR yang cocok dengan rentang nomor ini."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredList.map((qr) => (
                        <TableRow
                          key={qr.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-50/5 transition-colors"
                        >
                          {/* Checkbox Cell */}
                          <TableCell className="px-3 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(qr.id)}
                                onChange={() => toggleOne(qr.id)}
                                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                aria-label={`Pilih ${qr.unique_code || qr.id}`}
                              />
                            </div>
                          </TableCell>

                          {/* Unique Code Cell */}
                          <TableCell className="px-4 py-3 text-center align-middle">
                            <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
                              {qr.unique_code || "—"}
                            </span>
                          </TableCell>

                          {/* Nomor QR Cell */}
                          <TableCell className="px-4 py-3 text-center align-middle">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {qr.qr_number ?? "—"}
                            </span>
                          </TableCell>

                          {/* Token Cell */}
                          <TableCell className="px-4 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <code className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 font-mono truncate max-w-[180px]" title={qr.token_qr}>
                                {qr.token_qr.length > 20 ? `${qr.token_qr.slice(0, 20)}...` : qr.token_qr}
                              </code>
                            </div>
                          </TableCell>

                          {/* Download Action Cell */}
                          <TableCell className="px-4 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => void handleDownloadOne(qr)}
                                disabled={downloadingId === qr.id}
                                className="inline-flex items-center justify-center px-3 py-1 text-xs font-semibold text-brand-600 bg-brand-50 dark:bg-brand-500/10 rounded-md hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                              >
                                {downloadingId === qr.id ? (
                                  <span className="flex gap-1">
                                    <span className="animate-pulse">.</span>
                                    <span className="animate-pulse delay-75">.</span>
                                    <span className="animate-pulse delay-150">.</span>
                                  </span>
                                ) : (
                                  "PNG"
                                )}
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </ComponentCard>
      </div>
    </>
  );
}
