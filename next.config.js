/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Serve images as-is. Vercel Hobby caps Image Optimization (cache writes /
    // transformations); exceeding it paused the whole site. Source images are
    // pre-compressed in /public and admin uploads are converted to WebP client-side.
    unoptimized: true
  }
};

module.exports = nextConfig;
