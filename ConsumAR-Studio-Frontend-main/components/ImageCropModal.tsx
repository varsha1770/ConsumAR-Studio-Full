"use client";

import { useState, useRef, useEffect } from "react";
import {
  XMarkIcon,
  CheckIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  HandRaisedIcon,
} from "@heroicons/react/24/outline";

interface ImageCropModalProps {
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onClose: () => void;
}

export default function ImageCropModal({
  imageSrc,
  onCropComplete,
  onClose,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Load image object
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      setImageObj(img);
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    };
  }, [imageSrc]);

  // Render preview canvas
  useEffect(() => {
    if (!imageObj || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Calculate base scale to fill square
    const aspect = imageObj.width / imageObj.height;
    let drawWidth = size;
    let drawHeight = size;

    if (aspect > 1) {
      drawWidth = size * aspect;
    } else {
      drawHeight = size / aspect;
    }

    const scaledWidth = drawWidth * zoom;
    const scaledHeight = drawHeight * zoom;

    const centerX = size / 2 + position.x;
    const centerY = size / 2 + position.y;

    const x = centerX - scaledWidth / 2;
    const y = centerY - scaledHeight / 2;

    ctx.save();
    ctx.drawImage(imageObj, x, y, scaledWidth, scaledHeight);
    ctx.restore();
  }, [imageObj, zoom, position]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleApply = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.95);
    onCropComplete(dataUrl);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 flex flex-col items-center"
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <HandRaisedIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">Adjust & Crop Picture</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4 text-center font-medium">
          Drag to move photo • Use slider to zoom in/out
        </p>

        {/* CANVAS PREVIEW VIEWPORT WITH MASK */}
        <div className="relative w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] rounded-2xl overflow-hidden shadow-inner border border-slate-200 bg-slate-900 flex items-center justify-center select-none cursor-grab active:cursor-grabbing">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-full object-cover"
          />

          {/* CIRCULAR / ROUNDED-SQUARE GUIDE OVERLAY */}
          <div className="absolute inset-0 pointer-events-none border-[3px] border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
        </div>

        {/* ZOOM CONTROLS */}
        <div className="w-full mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <MagnifyingGlassMinusIcon className="w-4 h-4 text-slate-400" />
              Zoom
            </span>
            <span className="text-indigo-600">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Zoom Out"
            >
              <MagnifyingGlassMinusIcon className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
            />

            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Zoom In"
            >
              <MagnifyingGlassPlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RESET & APPLY BUTTONS */}
        <div className="w-full flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPosition({ x: 0, y: 0 });
            }}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Reset
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckIcon className="w-4 h-4" />
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
}
