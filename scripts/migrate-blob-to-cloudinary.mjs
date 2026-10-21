// One-time copy of gallery images from Vercel Blob to Cloudinary. Copies only;
// nothing is deleted from Blob. Safe to re-run (same public_id overwrites).
//
//   node --env-file=.env.local scripts/migrate-blob-to-cloudinary.mjs
//
// Needs BLOB_READ_WRITE_TOKEN, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
import { createHash } from "crypto";
import path from "path";
import { list } from "@vercel/blob";

const { BLOB_READ_WRITE_TOKEN, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
if (!BLOB_READ_WRITE_TOKEN || !CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("Missing env vars. See the comment at the top of this file.");
  process.exit(1);
}

function sign(params) {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(toSign + CLOUDINARY_API_SECRET).digest("hex");
}

let cursor;
let copied = 0;
do {
  const page = await list({ prefix: "gallery/", token: BLOB_READ_WRITE_TOKEN, cursor });
  for (const blob of page.blobs) {
    const params = {
      folder: "trinitas/gallery",
      public_id: path.basename(blob.pathname).replace(/\.[^.]+$/, ""),
      timestamp: String(Math.floor(Date.now() / 1000))
    };
    const form = new FormData();
    form.append("file", blob.url); // Cloudinary downloads it directly
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append("api_key", CLOUDINARY_API_KEY);
    form.append("signature", sign(params));

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      copied++;
      console.log("copied", blob.pathname, "->", data.secure_url);
    } else {
      console.error("FAILED", blob.pathname, data.error?.message);
    }
  }
  cursor = page.cursor;
} while (cursor);

console.log(`Done. ${copied} image(s) copied to Cloudinary.`);
