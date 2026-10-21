import { promises as fs } from "fs";
import path from "path";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  FULL_TRANSFORM,
  THUMB_TRANSFORM,
  isCloudinaryConfigured,
  listCloudinaryImages,
  withTransform
} from "@/lib/cloudinary";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const IMAGE_EXTENSIONS = new Set([".webp", ".jpg", ".jpeg", ".png"]);
const BLOB_RW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
// New uploads show within ~5 minutes; avoids hitting storage APIs on every visit.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };

type GalleryItem = {
  src: string;
  full?: string;
  title: string;
  subtitle: string;
};

// key = file name without extension, used to skip Blob copies already moved to Cloudinary.
type DatedItem = GalleryItem & { time: number; key: string };

const keyOf = (name: string) => path.basename(name).replace(/\.[^.]+$/, "");

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/-\d{10,}$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fromCloudinary(): Promise<DatedItem[]> {
  if (!isCloudinaryConfigured()) return [];
  const images = await listCloudinaryImages();
  return images.map((image) => ({
    src: withTransform(image.url, THUMB_TRANSFORM),
    full: withTransform(image.url, FULL_TRANSFORM),
    title: titleFromFileName(path.basename(image.publicId)),
    subtitle: "",
    time: Date.parse(image.createdAt),
    key: keyOf(image.publicId)
  }));
}

// Older uploads that were stored in Vercel Blob before the move to Cloudinary.
async function fromBlob(): Promise<DatedItem[]> {
  if (!BLOB_RW_TOKEN) return [];
  try {
    const blobs = await list({ prefix: "gallery/", token: BLOB_RW_TOKEN });
    return blobs.blobs
      .filter((blob) => IMAGE_EXTENSIONS.has(path.extname(blob.pathname).toLowerCase()))
      .map((blob) => ({
        src: blob.url,
        title: titleFromFileName(path.basename(blob.pathname)),
        subtitle: "",
        time: blob.uploadedAt.getTime(),
        key: keyOf(blob.pathname)
      }));
  } catch {
    return [];
  }
}

async function fromLocalUploads(): Promise<DatedItem[]> {
  try {
    const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);

    return Promise.all(
      files.map(async (name) => ({
        src: `/uploads/${name}`,
        title: titleFromFileName(name),
        subtitle: "",
        time: (await fs.stat(path.join(UPLOAD_DIR, name))).mtimeMs,
        key: keyOf(name)
      }))
    );
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [cloudinary, blob, local] = await Promise.all([fromCloudinary(), fromBlob(), fromLocalUploads()]);
    const movedKeys = new Set(cloudinary.map((item) => item.key));
    const images: GalleryItem[] = [...cloudinary, ...blob.filter((item) => !movedKeys.has(item.key)), ...local]
      .sort((a, b) => b.time - a.time)
      .map(({ time: _time, key: _key, ...item }) => item);

    return NextResponse.json({ images }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
