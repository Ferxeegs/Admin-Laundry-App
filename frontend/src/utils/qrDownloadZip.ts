import JSZip from "jszip";
import { createQrLabelPngBlob, sanitizeZipEntryName } from "./qrLabelImage";

/** Minimal fields needed to build label PNG / ZIP entries */
export interface QrZipRow {
  id: string;
  token_qr: string;
  unique_code: string | null;
  qr_number: string | null;
  color_details?: { name: string; color_code: string } | null;
}

export function qrLabelTextForDownload(qr: QrZipRow): string {
  return (qr.unique_code && qr.unique_code.trim()) || "—";
}

export function pngBaseNameForQrDownload(qr: QrZipRow, index: number): string {
  const base =
    (qr.unique_code && qr.unique_code.trim()) ||
    `qr-${qr.qr_number ?? "na"}-${qr.id.slice(0, 8)}`;
  return sanitizeZipEntryName(base) || `qr-${index}`;
}

export async function buildQrZipBlob(items: QrZipRow[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const qr = items[i];
    let name = pngBaseNameForQrDownload(qr, i);
    const n = usedNames.get(name) ?? 0;
    usedNames.set(name, n + 1);
    if (n > 0) name = `${name}_${n + 1}`;
    
    const colorLabel = qr.color_details ? qr.color_details.name : undefined;
    const blob = await createQrLabelPngBlob(qr.token_qr, qrLabelTextForDownload(qr), colorLabel);
    zip.file(`${name}.png`, blob);
  }
  return zip.generateAsync({ type: "blob" });
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadSingleQrLabelPng(qr: QrZipRow): Promise<void> {
  const colorLabel = qr.color_details ? qr.color_details.name : undefined;
  const blob = await createQrLabelPngBlob(qr.token_qr, qrLabelTextForDownload(qr), colorLabel);
  const name = `${pngBaseNameForQrDownload(qr, 0)}.png`;
  triggerBrowserDownload(blob, name);
}

/**
 * Infer prefix used in unique_code (format `{prefix}-{digits}`) from the most common pattern in the list.
 */
export function inferUniqueCodePrefix(codes: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of codes) {
    const uc = raw?.trim();
    if (!uc?.includes("-")) continue;
    const i = uc.lastIndexOf("-");
    const p = uc.slice(0, i);
    const tail = uc.slice(i + 1);
    if (!/^\d+$/.test(tail)) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestC = 0;
  for (const [p, c] of counts) {
    if (c > bestC) {
      best = p;
      bestC = c;
    }
  }
  return best;
}

/** Numeric suffix after `{prefix}-` (e.g. ASR-007 → 7). */
export function uniqueCodeSuffixNumber(
  uniqueCode: string | null | undefined,
  prefix: string,
): number | null {
  const uc = uniqueCode?.trim();
  if (!uc || !prefix) return null;
  const pre = `${prefix}-`;
  if (!uc.startsWith(pre)) return null;
  const rest = uc.slice(pre.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = parseInt(rest, 10);
  return Number.isFinite(n) ? n : null;
}

/** Filter by inclusive numeric suffix; empty from & to = pass all. Requires prefix when either bound set. */
export function uniqueCodeInNumericRange(
  uniqueCode: string | null | undefined,
  prefix: string | null,
  fromNum: number | null,
  toNum: number | null,
): boolean {
  if (fromNum === null && toNum === null) return true;
  if (!prefix) return false;
  const n = uniqueCodeSuffixNumber(uniqueCode, prefix);
  if (n === null) return false;
  if (fromNum !== null && n < fromNum) return false;
  if (toNum !== null && n > toNum) return false;
  return true;
}
