"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";

interface ModelPreview3DProps {
  glbUrl: string;
  dimensions: { length: string; width: string; height: string };
  unit?: string;
  onModelDimensionsDetected?: (dimensions: { length: number; width: number; height: number }) => void;
  isOptimizing?: boolean;
}

const unitToMeters: Record<string, number> = { ft: 0.3048, in: 0.0254, cm: 0.01, mm: 0.001, m: 1 };

export default function ModelPreview3D({ glbUrl, dimensions, unit = "ft", onModelDimensionsDetected, isOptimizing }: ModelPreview3DProps) {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [rawDimensions, setRawDimensions] = useState({ x: 0, y: 0, z: 0 });
  const [rawCenter, setRawCenter] = useState({ x: 0, y: 0, z: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  
  const modelViewerRef = useRef<any>(null);
  const line1Ref = useRef<SVGLineElement>(null);
  const line2Ref = useRef<SVGLineElement>(null);
  const line3Ref = useRef<SVGLineElement>(null);
  const rafRef = useRef<number | null>(null);
  const showDimensionsRef = useRef(true);

  const parseToM = useCallback((val: string | undefined | null) => {
    if (!val) return 0;
    // Regex matches numbers (including decimals/negatives) followed by optional space and unit
    const m = val.trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*(mm|cm|in|ft|m)$/i);
    if (!m) {
      // Fallback: try to just parse the number and assume meters
      const fallback = parseFloat(val);
      return isNaN(fallback) ? 0 : fallback;
    }
    const num = parseFloat(m[1]);
    const unitText = m[2].toLowerCase();
    return num * (unitToMeters[unitText] || 1);
  }, []);

  const formatVal = useCallback((val: string, unit: string) => {
    const meters = parseToM(val);
    const converted = meters / (unitToMeters[unit] || 1);
    // Use 2 decimal places to catch small changes like 2.48 to 2.52
    return `${Math.round(converted * 100) / 100}${unit}`;
  }, [parseToM]);

  const targetScale = "1 1 1";

  const drawLine = useCallback((line: SVGLineElement | null, viewer: any, n1: string, n2: string) => {
    if (!line || !viewer) return;
    // Align with slot names: use full 'hotspot-w1' etc.
    const h1 = viewer.queryHotspot(`hotspot-${n1}`);
    const h2 = viewer.queryHotspot(`hotspot-${n2}`);
    if (!h1?.canvasPosition || !h2?.canvasPosition) {
      line.setAttribute("opacity", "0");
      return;
    }
    line.setAttribute("x1", h1.canvasPosition.x.toString());
    line.setAttribute("y1", h1.canvasPosition.y.toString());
    line.setAttribute("x2", h2.canvasPosition.x.toString());
    line.setAttribute("y2", h2.canvasPosition.y.toString());
    line.setAttribute("opacity", showDimensionsRef.current ? "1" : "0");
  }, []);

  const [hotspotPositions, setHotspotPositions] = useState<Record<string, string>>({});

  const updateHotspots = useCallback(() => {
    const viewer = modelViewerRef.current;
    if (!viewer || !modelLoaded) return;

    const d = viewer.getDimensions();
    const c = viewer.getBoundingBoxCenter();
    if (d.x === 0) return;

    const minX = c.x - d.x / 2;
    const maxX = c.x + d.x / 2;
    const minY = c.y - d.y / 2;
    const maxY = c.y + d.y / 2;
    const minZ = c.z - d.z / 2;
    const maxZ = c.z + d.z / 2;

    // AESTHETIC OFFSETS (Picture 1 Look)
    const topPadding = d.y * 0.1;
    const sidePadding = d.x * 0.05;
    
    const hY = maxY + topPadding;
    const sX = maxX + sidePadding;
    const fZ = minZ - sidePadding;
    const bZ = maxZ + sidePadding;

    // p1: Top-Front-Left (Padded)
    // p2: Top-Front-Right (Padded)
    // p3: Bottom-Front-Right (Padded)
    // p4: Bottom-Back-Right (Padded)
    const p1 = `${minX}m ${hY}m ${fZ}m`;
    const p2 = `${sX}m ${hY}m ${fZ}m`;
    const p3 = `${sX}m ${minY}m ${fZ}m`;
    const p4 = `${sX}m ${minY}m ${bZ}m`;
    
    // Labels centered on lines
    const lw = `${c.x}m ${hY + (topPadding * 0.5)}m ${fZ}m`;
    const lh = `${sX + (sidePadding * 1.5)}m ${c.y}m ${fZ}m`;
    const ld = `${sX + (sidePadding * 1.5)}m ${minY}m ${c.z}m`;

    viewer.updateHotspot({ name: "hotspot-p1", position: p1 });
    viewer.updateHotspot({ name: "hotspot-p2", position: p2 });
    viewer.updateHotspot({ name: "hotspot-p3", position: p3 });
    viewer.updateHotspot({ name: "hotspot-p4", position: p4 });
    viewer.updateHotspot({ name: "hotspot-label-w", position: lw });
    viewer.updateHotspot({ name: "hotspot-label-h", position: lh });
    viewer.updateHotspot({ name: "hotspot-label-d", position: ld });

    const u = (slot: string, val: string) => {
      const el = viewer.querySelector(`[slot="hotspot-${slot}"]`);
      if (el) (el as HTMLElement).innerText = formatVal(val, unit);
    };
    u("label-w", dimensions.length); 
    u("label-h", dimensions.height); 
    u("label-d", dimensions.width);   
  }, [dimensions.length, dimensions.width, dimensions.height, unit, formatVal, modelLoaded]);

  const lastDetectedRef = useRef<string>("");

  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;

    const handleLoad = () => {
      const d = viewer.getDimensions();
      const c = viewer.getBoundingBoxCenter();
      
      const key = `${d.x}-${d.y}-${d.z}`;
      if (key === lastDetectedRef.current) return;
      lastDetectedRef.current = key;

      setRawDimensions({ x: d.x, y: d.y, z: d.z });
      setRawCenter({ x: c.x, y: c.y, z: c.z });
      setModelLoaded(true);
      
      onModelDimensionsDetected?.({ length: d.x, width: d.z, height: d.y });
    };

    viewer.addEventListener("load", handleLoad);
    if (viewer.loaded) handleLoad();
    
    // FRAME-SYNC LOOP: Update hotspots and lines 60 times per second
    // This removes all "diagonal" frames and flickering.
    const runLoop = () => {
      if (!modelLoaded) {
        rafRef.current = requestAnimationFrame(runLoop);
        return;
      }

      updateHotspots();
      
      const line1 = line1Ref.current;
      const line2 = line2Ref.current;
      const line3 = line3Ref.current;
      
      if (showDimensionsRef.current) {
        drawLine(line1, viewer, "p1", "p2");
        drawLine(line2, viewer, "p2", "p3");
        drawLine(line3, viewer, "p3", "p4");
      } else {
        if (line1) line1.setAttribute("opacity", "0");
        if (line2) line2.setAttribute("opacity", "0");
        if (line3) line3.setAttribute("opacity", "0");
      }

      rafRef.current = requestAnimationFrame(runLoop);
    };

    rafRef.current = requestAnimationFrame(runLoop);
    
    return () => {
      viewer.removeEventListener("load", handleLoad);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onModelDimensionsDetected, modelLoaded, updateHotspots, drawLine]);

  // Remove the old disconnected useEffects that were causing the sync issues
  useEffect(() => {
    showDimensionsRef.current = showDimensions;
  }, [showDimensions]);

  useEffect(() => { 
    if (modelLoaded) {
      updateHotspots();
      // Schedule a second pass to catch model-viewer layout changes
      const t = setTimeout(updateHotspots, 200);
      return () => clearTimeout(t);
    }
  }, [glbUrl, dimensions.length, dimensions.width, dimensions.height, modelLoaded, updateHotspots]);

  useEffect(() => { showDimensionsRef.current = showDimensions; }, [showDimensions]);

  const orbitDist = useMemo(() => {
    const max = Math.max(rawDimensions.x, rawDimensions.y, rawDimensions.z) || 1.5;
    return `${max * 2.5}m`;
  }, [rawDimensions.x, rawDimensions.y, rawDimensions.z]);

  return (
    <div className="relative w-full h-full bg-white font-sans overflow-hidden border border-gray-200 shadow-sm rounded-xl">
      <style jsx>{`
        .dot { 
          display: block; width: 8px; height: 8px; 
          border: 2px solid #222; border-radius: 9999px; 
          background: #fff; 
          pointer-events: none; z-index: 100;
          box-sizing: border-box;
        }
        .dim { 
          display: block; padding: 4px 10px; 
          background: #fff; border: 1px solid #222; 
          border-radius: 4px; color: #222; 
          font-size: 13px; font-weight: 800; 
          pointer-events: none; z-index: 200; 
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); 
        }
        .hide { display: none !important; }
      `}</style>

      <model-viewer
        ref={modelViewerRef}
        src={glbUrl}
        alt="3D model preview"
        scale={targetScale}
        camera-target="auto"
        camera-orbit={`45deg 75deg ${orbitDist}`}
        camera-controls
        exposure="1.0"
        shadow-intensity="1.5"
        shadow-softness="1.0"
        environment-image="neutral"
        min-field-of-view="10deg"
        max-field-of-view="120deg"
        interaction-prompt="none"
        style={{ width: "100%", height: "100%", backgroundColor: "#ffffff" }}
      >
        {/* Hotspots - simplified visibility and registration */}
        <div slot="hotspot-label-w" data-position="0 0 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-h" data-position="0 0 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-d" data-position="0 0 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />

        {/* 4 Pinpoints system */}
        <div slot="hotspot-p1" data-position="0 0 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p2" data-position="0 0 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p3" data-position="0 0 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p4" data-position="0 0 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
      </model-viewer>

      <svg 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showDimensions && !isOptimizing ? "opacity-100" : "opacity-0"}`} 
        style={{ zIndex: 1000, width: "100%", height: "100%" }}
      >
        <line ref={line1Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
        <line ref={line2Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
        <line ref={line3Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      </svg>

      <div className={`absolute bottom-6 right-6 z-[2000] transition-opacity duration-500 ${isOptimizing ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <button
          onClick={() => setShowDimensions(!showDimensions)}
          disabled={isOptimizing}
          className="p-3 bg-white rounded-full shadow-2xl border-2 border-green-500 text-green-600 hover:scale-110 active:scale-95 transition-all flex items-center justify-center transform"
        >
          {showDimensions ? <EyeIcon className="w-6 h-6" /> : <EyeSlashIcon className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}
