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

function baseNameFromFile(file: File, fallback: string): string {
  const n = file.name.replace(/\.[^/.]+$/, "");
  return n || fallback;
}

/** Target ≤ 1 MB for profile / avatar uploads */
const PROFILE_WEBP_OPTIONS = {
  maxSizeMB: 0.95,
  maxWidthOrHeight: 1024,
  useWebWorker: true,
  fileType: "image/webp" as const,
  initialQuality: 0.82,
};

const PROFILE_JPEG_FALLBACK_OPTIONS = {
  maxSizeMB: 0.95,
  maxWidthOrHeight: 1024,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.82,
};

const MAX_PROFILE_BYTES = 1024 * 1024;

/**
 * Resize + compress profile photos; output kept under 1 MB when possible (WebP preferred).
 */
export async function compressProfileImage(file: File): Promise<File> {
  let result: File;
  try {
    const compressed = await imageCompression(file, PROFILE_WEBP_OPTIONS);
    result = new File([compressed], `${baseNameFromFile(file, "profile")}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    const compressed = await imageCompression(file, PROFILE_JPEG_FALLBACK_OPTIONS);
    result = new File([compressed], `${baseNameFromFile(file, "profile")}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  if (result.size > MAX_PROFILE_BYTES) {
    const smaller = await imageCompression(result, {
      maxSizeMB: 0.85,
      maxWidthOrHeight: 800,
      useWebWorker: true,
      fileType: result.type === "image/webp" ? ("image/webp" as const) : ("image/jpeg" as const),
      initialQuality: 0.75,
    });
    result = new File(
      [smaller],
      result.name,
      { type: result.type, lastModified: Date.now() }
    );
  }

  if (result.size > MAX_PROFILE_BYTES) {
    throw new Error("Gambar masih melebihi 1 MB setelah kompresi. Pilih gambar lain.");
  }

  return result;
}

/**
 * Resize + compress laundry order photos before upload (WebP preferred).
 */
export async function compressOrderImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, WEBP_OPTIONS);
    const name = `${baseNameFromFile(file, "order-image")}.webp`;
    return new File([compressed], name, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    const compressed = await imageCompression(file, JPEG_FALLBACK_OPTIONS);
    const name = `${baseNameFromFile(file, "order-image")}.jpg`;
    return new File([compressed], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }
}
