"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";

interface ModelPreview3DProps {
  glbUrl: string;
  dimensions: { length: string; width: string; height: string };
  currentUnit?: string;
  onModelDimensionsDetected?: (dimensions: { length: number; width: number; height: number }) => void;
  onReset?: () => void;
  onError?: () => void;
  isOptimizing?: boolean;
  userTier?: string;
  isAdmin?: boolean;
}

const unitToMeters: Record<string, number> = { 
  ft: 0.3048, feet: 0.3048,
  in: 0.0254, inches: 0.0254,
  cm: 0.01, centimeters: 0.01,
  mm: 0.001, millimeters: 0.001,
  m: 1, meters: 1
};

export default function ModelPreview3D({ 
  glbUrl, 
  dimensions, 
  currentUnit = "centimeters", 
  onModelDimensionsDetected, 
  isOptimizing 
}: ModelPreview3DProps) {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [rawDimensions, setRawDimensions] = useState({ x: 0, y: 0, z: 0 });
  const [rawCenter, setRawCenter] = useState({ x: 0, y: 0, z: 0 });
  const [showDimensions, setShowDimensions] = useState(true);

  const modelViewerRef = useRef<any>(null);
  const line1Ref = useRef<SVGLineElement>(null);
  const line2Ref = useRef<SVGLineElement>(null);
  const line3Ref = useRef<SVGLineElement>(null);
  const onDetectedRef = useRef(onModelDimensionsDetected);
  useEffect(() => { onDetectedRef.current = onModelDimensionsDetected; }, [onModelDimensionsDetected]);
  const rafRef = useRef<number | null>(null);
  const showDimensionsRef = useRef(true);

  const parseToM = useCallback((val: string | undefined | null) => {
    if (!val) return 0;
    const m = val.trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*(mm|cm|in|ft|m|millimeters|centimeters|inches|feet|meters)$/i);
    if (!m) {
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
    const label = unit === "centimeters" ? "cm" : unit === "millimeters" ? "mm" : unit === "inches" ? "in" : unit === "feet" ? "ft" : unit === "meters" ? "m" : unit.slice(0,2);
    return `${Math.round(converted * 100) / 100}${label}`;
  }, [parseToM]);

  const targetScale = "1 1 1";

  const drawLine = useCallback((line: SVGLineElement | null, viewer: any, n1: string, n2: string) => {
    if (!line || !viewer) return;
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
    line.setAttribute("opacity", (showDimensionsRef.current && !isOptimizing) ? "1" : "0");
  }, [isOptimizing]);

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

    const topPadding = d.y * 0.08;
    const sidePadding = d.x * 0.04;

    const hY = maxY + topPadding;
    const sX = maxX + sidePadding;
    const fZ = minZ - sidePadding;
    const bZ = maxZ + sidePadding;

    const p1 = `${minX}m ${hY}m ${fZ}m`;
    const p2 = `${maxX}m ${hY}m ${fZ}m`;
    const p3 = `${maxX}m ${minY}m ${fZ}m`;
    const p4 = `${maxX}m ${minY}m ${maxZ}m`;

    const lw = `${c.x}m ${hY + 0.05}m ${fZ}m`;
    const lh = `${maxX + 0.05}m ${c.y}m ${fZ}m`;
    const ld = `${maxX + 0.05}m ${minY}m ${c.z}m`;

    viewer.updateHotspot({ name: "hotspot-p1", position: p1 });
    viewer.updateHotspot({ name: "hotspot-p2", position: p2 });
    viewer.updateHotspot({ name: "hotspot-p3", position: p3 });
    viewer.updateHotspot({ name: "hotspot-p4", position: p4 });
    
    viewer.updateHotspot({ name: "hotspot-label-w", position: lw });
    viewer.updateHotspot({ name: "hotspot-label-h", position: lh });
    viewer.updateHotspot({ name: "hotspot-label-d", position: ld });

    const u = (slot: string, val: string) => {
      const el = viewer.querySelector(`[slot="hotspot-${slot}"]`);
      if (el) (el as HTMLElement).innerText = formatVal(val, currentUnit);
    };
    u("label-w", dimensions.length);
    u("label-h", dimensions.height);
    u("label-d", dimensions.width);
  }, [dimensions.length, dimensions.width, dimensions.height, currentUnit, formatVal, modelLoaded]);

  // V19: STABLE RENDER LOOP
  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;

    const handleLoad = () => {
      const d = viewer.getDimensions();
      const c = viewer.getBoundingBoxCenter();
      
      // Only update if changed to avoid loops
      setRawDimensions(prev => {
        if (prev.x === d.x && prev.y === d.y && prev.z === d.z) return prev;
        return { x: d.x, y: d.y, z: d.z };
      });
      setRawCenter(prev => {
        if (prev.x === c.x && prev.y === c.y && prev.z === c.z) return prev;
        return { x: c.x, y: c.y, z: c.z };
      });
      
      setModelLoaded(true);
      onDetectedRef.current?.({ length: d.x, width: d.z, height: d.y });
    };

    viewer.addEventListener("load", handleLoad);
    if (viewer.loaded) handleLoad();

    return () => viewer.removeEventListener("load", handleLoad);
  }, [glbUrl]); // Removed onModelDimensionsDetected to stop loop

  // V19: ANIMATION LOOP (Separated for stability)
  useEffect(() => {
    const runLoop = () => {
      if (modelLoaded && !isOptimizing) {
        updateHotspots();
        const viewer = modelViewerRef.current;
        if (viewer) {
          drawLine(line1Ref.current, viewer, "p1", "p2");
          drawLine(line2Ref.current, viewer, "p2", "p3");
          drawLine(line3Ref.current, viewer, "p3", "p4");
        }
      }
      rafRef.current = requestAnimationFrame(runLoop);
    };

    rafRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [modelLoaded, isOptimizing, updateHotspots, drawLine]);

  useEffect(() => { showDimensionsRef.current = showDimensions; }, [showDimensions]);

  useEffect(() => {
    if (modelLoaded) {
      updateHotspots();
      const t = setTimeout(updateHotspots, 200);
      return () => clearTimeout(t);
    }
  }, [glbUrl, dimensions.length, dimensions.width, dimensions.height, modelLoaded, updateHotspots]);

  const orbitDist = useMemo(() => {
    const max = Math.max(rawDimensions.x, rawDimensions.y, rawDimensions.z) || 1.5;
    return `${max * 2.5}m`;
  }, [rawDimensions.x, rawDimensions.y, rawDimensions.z]);

  return (
    <div className="relative w-full min-h-[500px] bg-white font-sans overflow-hidden border border-gray-200 shadow-sm rounded-xl flex flex-col">
      <style jsx>{`
        .dot { display: block; width: 8px; height: 8px; border: 2px solid #222; border-radius: 50%; background: #fff; pointer-events: none; z-index: 100; }
        .dim { display: block; padding: 4px 10px; background: #fff; border: 1px solid #222; border-radius: 4px; color: #222; font-size: 13px; font-weight: 800; pointer-events: none; z-index: 200; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
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
        environment-image="neutral"
        style={{ width: "100%", flex: 1, backgroundColor: "#ffffff" }}
      >
        <div slot="hotspot-label-w" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-h" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-d" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />

        <div slot="hotspot-p1" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p2" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p3" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p4" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
      </model-viewer>

      <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ zIndex: 1000 }}>
        <line ref={line1Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
        <line ref={line2Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
        <line ref={line3Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
      </svg>

      <div className={`absolute bottom-6 right-6 z-[2000] transition-opacity duration-500 ${isOptimizing ? "opacity-0" : "opacity-100"}`}>
        <button onClick={() => setShowDimensions(!showDimensions)} className="p-3 bg-white rounded-full shadow-2xl border-2 border-green-500 text-green-600 hover:scale-110 transition-all">
          {showDimensions ? <EyeIcon className="w-6 h-6" /> : <EyeSlashIcon className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}
