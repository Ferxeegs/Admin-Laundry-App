import imageCompression from "browser-image-compression";

const WEBP_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1024,
  useWebWorker: true,
  fileType: "image/webp" as const,
  initialQuality: 0.85,
};

const JPEG_FALLBACK_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1024,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.85,
};

function baseNameFromFile(file: File): string {
  const n = file.name.replace(/\.[^/.]+$/, "");
  return n || "order-image";
}

/**
 * Resize + compress laundry order photos before upload (WebP preferred).
 */
export async function compressOrderImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, WEBP_OPTIONS);
    const name = `${baseNameFromFile(file)}.webp`;
    return new File([compressed], name, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    const compressed = await imageCompression(file, JPEG_FALLBACK_OPTIONS);
    const name = `${baseNameFromFile(file)}.jpg`;
    return new File([compressed], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }
}
