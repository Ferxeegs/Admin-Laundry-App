import QRCode from "qrcode";

/**
 * PNG: QR (isi `tokenQr`) di atas, teks label (biasanya `unique_code`) di bawah.
 */
export async function createQrLabelPngBlob(
  tokenQr: string,
  label: string,
  colorLabel?: string,
): Promise<Blob> {
  const padding = 16;
  const qrSize = 200;
  const labelHeight = colorLabel ? 64 : 48;
  const w = qrSize + padding * 2;
  const h = padding + qrSize + 12 + labelHeight + padding;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas tidak tersedia");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, tokenQr, {
    width: qrSize,
    margin: 1,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
  ctx.drawImage(qrCanvas, padding, padding);

  ctx.fillStyle = "#111827";
  ctx.font = "600 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const textY = padding + qrSize + 12;
  const line = (label || "-").trim() || "-";
  ctx.fillText(line, w / 2, textY);

  if (colorLabel) {
    ctx.font = "500 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.fillText(colorLabel, w / 2, textY + 22);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Gagal membuat PNG"));
      },
      "image/png",
      1,
    );
  });
}

export function sanitizeZipEntryName(base: string): string {
  return base.replace(/[/\\:*?"<>|]/g, "_").slice(0, 120) || "qr";
}
