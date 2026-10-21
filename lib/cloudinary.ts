import { createHash } from "crypto";

// Gallery image storage on Cloudinary (free plan: 25 credits/month). Talks to the
// REST API directly so no SDK is needed. Configure in the deployment env:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const GALLERY_FOLDER = "trinitas/gallery";

// f_auto/q_auto: Cloudinary picks AVIF/WebP and quality per browser.
// c_limit: never upscales. Each size is generated once, then served from CDN.
export const THUMB_TRANSFORM = "f_auto,q_auto,c_limit,w_800";
export const FULL_TRANSFORM = "f_auto,q_auto,c_limit,w_1920";

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

function sign(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(toSign + API_SECRET).digest("hex");
}

/** Uploads an image (File, or a remote URL Cloudinary fetches itself). Returns its secure_url. */
export async function uploadToCloudinary(file: Blob | string, publicId: string): Promise<string> {
  const params = {
    folder: GALLERY_FOLDER,
    public_id: publicId,
    timestamp: String(Math.floor(Date.now() / 1000))
  };

  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("api_key", API_KEY!);
  form.append("signature", sign(params));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form
  });
  const data = (await response.json()) as { secure_url?: string; error?: { message?: string } };

  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message || "Cloudinary upload failed.");
  }
  return data.secure_url;
}

export type CloudinaryImage = {
  url: string;
  publicId: string;
  createdAt: string;
};

/** Gallery images, newest first. */
export async function listCloudinaryImages(): Promise<CloudinaryImage[]> {
  const endpoint = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/upload`);
  endpoint.searchParams.set("prefix", `${GALLERY_FOLDER}/`);
  endpoint.searchParams.set("max_results", "500");

  const response = await fetch(endpoint, {
    headers: { Authorization: `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64")}` },
    next: { revalidate: 300 }
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    resources?: Array<{ secure_url: string; public_id: string; created_at: string }>;
  };

  return (data.resources ?? [])
    .map((item) => ({ url: item.secure_url, publicId: item.public_id, createdAt: item.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Inserts a transformation into a Cloudinary delivery URL. */
export function withTransform(url: string, transform: string): string {
  return url.replace("/image/upload/", `/image/upload/${transform}/`);
}
