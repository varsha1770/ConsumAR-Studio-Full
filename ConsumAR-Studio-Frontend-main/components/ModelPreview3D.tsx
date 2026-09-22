"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { EyeIcon, EyeSlashIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { QRCodeSVG } from 'qrcode.react';

interface ModelPreview3DProps {
  glbUrl: string;
  publicGlbUrl?: string;
  usdzUrl?: string | null;
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

/** Proxy S3/EC2 URLs through Next.js to avoid browser CORS blocks */
const toProxied = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/')) {
    return url;
  }
  
  // Rule: If it's a valid remote S3 URL, do not proxy it. Let the client fetch it directly.
  // EXCEPT for USDZ files! Apple's AR Quick Look API silently crashes if the ios-src URL contains
  // S3 query parameters (like ?X-Amz-Algorithm=). We MUST proxy USDZ files to give iOS a clean URL.
  const isUsdz = url.toLowerCase().includes('.usdz');
  if (!isUsdz && (url.includes('.s3.') || url.includes('amazonaws.com'))) {
    return url;
  }

  const ext = isUsdz ? '.usdz' : '.glb';
  // V20: Apple AR Quick Look URL Fix (Base64 path encoding with chunking)
  const encodedUrl = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const chunks = encodedUrl.match(/.{1,200}/g)?.join('/') || encodedUrl;
  return `/api/proxy-model/${chunks}/file${ext}`;
};

export default function ModelPreview3D({
  glbUrl,
  publicGlbUrl,
  usdzUrl,
  dimensions,
  currentUnit = "centimeters",
  onModelDimensionsDetected,
  isOptimizing
}: ModelPreview3DProps) {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [rawDimensions, setRawDimensions] = useState({ x: 0, y: 0, z: 0 });
  const [rawCenter, setRawCenter] = useState({ x: 0, y: 0, z: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [localIp, setLocalIp] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setIsMobileDevice(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    setLocalIp(window.location.host);
  }, []);

  const [shortId, setShortId] = useState("");
  const shortIdRef = useRef<string>("");

  useEffect(() => {
    if (!glbUrl && !usdzUrl) return;
    
    // Generate ID synchronously to prevent race conditions
    if (!shortIdRef.current) {
      const newId = Math.random().toString(36).substring(2, 8);
      shortIdRef.current = newId;
      setShortId(newId);
    }

    const fetchShortId = async () => {
      try {
        const payload: any = { 
          id: shortIdRef.current,
          glbUrl: publicGlbUrl || glbUrl, 
          usdzUrl: toProxied(usdzUrl || null) 
        };
        
        await fetch("/api/ar-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Failed to update AR link", err);
      }
    };
    
    fetchShortId();
  }, [glbUrl, publicGlbUrl, usdzUrl]);

  const qrUrl = (isMounted && localIp && shortId) ? `http://${localIp}/ar-view?id=${shortId}` : '';

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
    const label = unit === "centimeters" ? "cm" : unit === "millimeters" ? "mm" : unit === "inches" ? "in" : unit === "feet" ? "ft" : unit === "meters" ? "m" : unit.slice(0, 2);
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

    const topPadding = d.y * 0.05;
    const sidePadding = d.x * 0.03;

    const hY = maxY + topPadding;
    const sX = maxX + sidePadding;
    const fZ = minZ - sidePadding;
    const bZ = maxZ + sidePadding;

    const p1 = `${minX}m ${hY}m ${fZ}m`;
    const p2 = `${maxX}m ${hY}m ${fZ}m`;
    const p3 = `${maxX}m ${minY}m ${fZ}m`;
    const p4 = `${maxX}m ${minY}m ${maxZ}m`;

    const lw = `${c.x}m ${hY}m ${fZ}m`;
    const lh = `${maxX}m ${c.y}m ${fZ}m`;
    const ld = `${maxX}m ${minY}m ${c.z}m`;

    viewer.updateHotspot({ name: "hotspot-p1", position: p1 });
    viewer.updateHotspot({ name: "hotspot-p2", position: p2 });
    viewer.updateHotspot({ name: "hotspot-p3", position: p3 });
    viewer.updateHotspot({ name: "hotspot-p4", position: p4 });

    viewer.updateHotspot({ name: "hotspot-label-w", position: lw });
    viewer.updateHotspot({ name: "hotspot-label-h", position: lh });
    viewer.updateHotspot({ name: "hotspot-label-d", position: ld });

    const formatBadgeText = (inputVal: string | undefined, fallbackMeters: number) => {
      if (inputVal) {
        const text = formatVal(inputVal, currentUnit);
        if (text && text !== "NaN" && text !== "0cm" && text !== "0ft" && text !== "0m" && text !== "0in" && text !== "0mm" && !text.includes("NaN")) {
          return text;
        }
      }
      if (fallbackMeters > 0) {
        const unitFactor = unitToMeters[currentUnit] || 1;
        const converted = fallbackMeters / unitFactor;
        const label = currentUnit === "centimeters" ? "cm" : currentUnit === "millimeters" ? "mm" : currentUnit === "inches" ? "in" : currentUnit === "feet" ? "ft" : currentUnit === "meters" ? "m" : currentUnit.slice(0, 2);
        return `${Math.round(converted * 1000) / 1000}${label}`;
      }
      return "";
    };

    const u = (slot: string, val: string, fallbackMeters: number) => {
      const el = viewer.querySelector(`[slot="hotspot-${slot}"]`);
      if (el) {
        const text = formatBadgeText(val, fallbackMeters);
        (el as HTMLElement).innerText = text;
      }
    };
    u("label-w", dimensions.length, d.x);
    u("label-h", dimensions.height, d.y);
    u("label-d", dimensions.width, d.z);
  }, [dimensions.length, dimensions.width, dimensions.height, currentUnit, formatVal, modelLoaded]);

  // V19: STABLE RENDER LOOP
  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;

    const handleLoad = () => {
      console.log("[ModelPreview3D] GLB loaded successfully:", glbUrl);
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

    const handleError = (errEvent: any) => {
      console.error("[ModelPreview3D] GLB Load Failed for URL:", glbUrl, errEvent?.detail);
    };

    viewer.addEventListener("load", handleLoad);
    viewer.addEventListener("error", handleError);
    if (viewer.loaded) handleLoad();

    return () => {
      viewer.removeEventListener("load", handleLoad);
      viewer.removeEventListener("error", handleError);
    };
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
      const [sx, sy, sz] = targetScale.split(' ').map(parseFloat);
      const scaledX = (rawDimensions.x || 0) * sx;
      const scaledY = (rawDimensions.y || 0) * sy;
      const scaledZ = (rawDimensions.z || 0) * sz;
      const max = Math.max(scaledX, scaledY, scaledZ) || 1.5;
      return `${max * 3}m`;
    }, [rawDimensions.x, rawDimensions.y, rawDimensions.z, targetScale]);

  return (
    <div className="relative w-full h-full bg-transparent font-sans overflow-hidden flex flex-col shrink-0">
      <style jsx>{`
    .dot { display: block; width: 6px; height: 6px; border: 1.5px solid #222; border-radius: 50%; background: #fff; pointer-events: none; z-index: 100; transform: translate(-50%, -50%); }
    .dim { display: flex; align-items: center; justify-content: center; padding: 3px 8px; background: #ffffff; border: 1.5px solid #111827; border-radius: 6px; color: #111827; font-size: 11px; font-weight: 800; pointer-events: none; z-index: 500; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); transform: translate(-50%, -50%); white-space: nowrap; }
    .hide { display: none !important; }
    .force-ar-btn { display: flex !important; }
    
    @media (min-width: 640px) {
      .dot { width: 8px; height: 8px; border-width: 2px; }
      .dim { padding: 4px 10px; font-size: 12px; }
    }
  `}</style>

      <model-viewer
        ref={modelViewerRef}
        src={glbUrl}
        ios-src={usdzUrl || undefined}
        draco-decoder-location="https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-placement="floor"
        ar-scale="auto"
        alt="3D model preview"
        scale={targetScale}
        camera-target="auto"
        bounds="tight"
        camera-orbit={`45deg 75deg ${orbitDist}`}
        camera-controls
        exposure="1.0"
        shadow-intensity="1.5"
        environment-image="neutral"
        style={{ width: "100%", height: "100%", flex: 1, backgroundColor: "#ffffff" }}
      >
        <div slot="hotspot-label-w" data-position="0m 0m 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-h" data-position="0m 0m 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-label-d" data-position="0m 0m 0m" className={`dim${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />

        <div slot="hotspot-p1" data-position="0m 0m 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p2" data-position="0m 0m 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p3" data-position="0m 0m 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />
        <div slot="hotspot-p4" data-position="0m 0m 0m" className={`dot${showDimensions && modelLoaded && !isOptimizing ? "" : " hide"}`} />

        {/* REAL AR BUTTON (Only rendered inside model-viewer on Mobile) */}
        {isMobileDevice && (
          <button
            slot="ar-button"
            className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-[2000] p-2 sm:px-4 sm:py-2.5 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border transition-all flex items-center justify-center font-semibold text-sm bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v1h1V5H5zm0 8a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1v-3a1 1 0 00-1-1H5zm1 1v1h1v-1H6zm8-9a1 1 0 00-1-1h-3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4zm-1 1v1h-1V5h1zm0 8a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1v-3a1 1 0 00-1-1h-3zm1 1v1h-1v-1h1z" clipRule="evenodd" />
            </svg>
            View in AR
          </button>
        )}
      </model-viewer>

      {/* FAKE AR BUTTON (Rendered OUTSIDE model-viewer on Desktop so it never gets hidden) */}
      {!isMobileDevice && (
        <button
          onClick={() => setShowQRModal(true)}
          className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-[2000] p-2 sm:px-5 sm:py-3 rounded-full shadow-[0_8px_16px_rgba(0,0,0,0.1)] border transition-all flex items-center justify-center font-bold text-sm bg-white text-blue-600 border-white hover:bg-blue-50 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          Scan for AR
        </button>
      )}

      {showQRModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full relative flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <button 
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">View in your space</h3>
            <p className="text-sm text-gray-500 mb-6">Scan this QR code with your phone's camera to instantly view this 3D model in Augmented Reality.</p>
            
            <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 mb-4">
              {qrUrl ? <QRCodeSVG value={qrUrl} size={180} /> : null}
            </div>
            
            <p className="text-xs text-gray-400">Works on iPhone and Android</p>
          </div>
        </div>
      )}

      <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ zIndex: 1000, filter: "drop-shadow(0px 0px 2px rgba(255,255,255,0.8))" }}>
        <line ref={line1Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
        <line ref={line2Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
        <line ref={line3Ref} stroke="#000" strokeWidth="2" strokeDasharray="4 4" />
      </svg>

      <div className={`absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-[2000] transition-opacity duration-500 ${isOptimizing ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <button
          onClick={() => setShowDimensions(!showDimensions)}
          className="p-2.5 sm:p-3 bg-white/80 backdrop-blur-md rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-white/50 text-indigo-500 hover:text-indigo-600 hover:bg-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
          aria-label="Toggle Dimensions"
        >
          {showDimensions ? <EyeIcon className="w-5 h-5 transition-transform group-hover:scale-110" /> : <EyeSlashIcon className="w-5 h-5 text-gray-400 transition-transform group-hover:scale-110" />}
        </button>
      </div>
    </div>
  );
}
