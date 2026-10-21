"use client";

import { useState, useEffect } from "react";
import { X, Maximize2, Camera } from "lucide-react";

type GalleryImage = {
  src: string; // grid thumbnail
  full?: string; // lightbox size; falls back to src
  title: string;
  subtitle: string;
};

const staticImage = (n: number, title: string, subtitle: string): GalleryImage => ({
  src: `/gallery/gal-${n}-sm.webp`,
  full: `/gallery/gal-${n}.webp`,
  title,
  subtitle
});

const galleryImages: GalleryImage[] = [
  staticImage(1, "Church Exterior", "Trinitas campus view"),
  staticImage(2, "Worship Gathering", "Sunday celebration service"),
  staticImage(3, "Ministry Moment", "Word and worship in unity"),
  staticImage(4, "Church Fellowship", "Community and spiritual growth"),
  staticImage(5, "Special Service", "Prayer and praise session"),
  staticImage(6, "Special Service", "Prayer and praise session"),
  staticImage(7, "Special Service", "Prayer and praise session"),
  staticImage(8, "Special Service", "Prayer and praise session"),
];

export default function Gallery() {

  const [selectedImg, setSelectedImg] = useState<GalleryImage | null>(null);
  const [uploadedImages, setUploadedImages] = useState<GalleryImage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const imagesPerPage = 6;

  const allImages = [...uploadedImages, ...galleryImages];

  const totalPages = Math.ceil(allImages.length / imagesPerPage);

  const startIndex = (currentPage - 1) * imagesPerPage;
  const currentImages = allImages.slice(startIndex, startIndex + imagesPerPage);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedImg(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    const fetchUploadedImages = async () => {
      try {
        const res = await fetch("/api/gallery-images");
        const data = await res.json();
        setUploadedImages(Array.isArray(data.images) ? data.images : []);
      } catch {
        setUploadedImages([]);
      }
    };

    fetchUploadedImages();
  }, []);

  return (
    <section id="gallery" className="bg-[#fcfcfc] py-24">

      <div className="max-w-7xl mx-auto px-6 lg:px-20">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={16} className="text-gold"/>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-navy/40">
              Visual Ministry
            </span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-navy uppercase italic">
            Church <span className="text-gold">Gallery</span>
          </h2>
        </div>

        {/* Gallery Grid: masonry columns so each card takes its image's own shape (no empty frame) */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">

          {currentImages.map((image) => (
            <div
              key={image.src}
              className="relative group mb-6 block break-inside-avoid cursor-zoom-in overflow-hidden rounded-3xl shadow-md transition hover:shadow-2xl"
              onClick={() => setSelectedImg(image)}
            >

              <img
                src={image.src}
                alt={image.title}
                className="block h-auto w-full transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />

              <div className="absolute inset-0 bg-navy/35 opacity-0 group-hover:opacity-100 transition flex items-end p-6">
                <Maximize2 className="text-gold" size={20}/>
              </div>

            </div>
          ))}

        </div>

        {/* Pagination */}
        <div className="flex justify-center items-center gap-3 mt-14">

          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-slate-100 disabled:opacity-40"
          >
            Previous
          </button>

          {[...Array(totalPages)].map((_, index) => {
            const page = index + 1;
            return (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 rounded-lg text-sm font-bold border transition
                ${currentPage === page
                  ? "bg-gold text-white border-gold"
                  : "hover:bg-slate-100"}`}
              >
                {page}
              </button>
            );
          })}

          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-slate-100 disabled:opacity-40"
          >
            Next
          </button>

        </div>

        {/* Lightbox */}
        {selectedImg && (
          <div
            className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center"
            onClick={() => setSelectedImg(null)}
          >

            <button
              className="absolute top-10 right-10 text-white"
              onClick={() => setSelectedImg(null)}
            >
              <X size={40}/>
            </button>

            <div className="relative w-[90%] max-w-5xl h-[70vh]">
              <img
                src={selectedImg.full || selectedImg.src}
                alt={selectedImg.title}
                className="h-full w-full object-contain"
              />
            </div>

          </div>
        )}

      </div>
    </section>
  );
}
