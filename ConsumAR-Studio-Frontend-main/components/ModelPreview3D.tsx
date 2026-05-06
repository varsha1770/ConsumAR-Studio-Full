'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { EyeIcon, EyeSlashIcon, CubeTransparentIcon } from '@heroicons/react/24/solid';

export default function ModelPreview3D({ 
  glbUrl, 
  dimensions = { length: "0", width: "0", height: "0" }, 
  onModelDimensionsDetected,
  onReset,
  onError,
  isOptimizing,
  userTier = "NON_LOGGED",
  isAdmin = false
}: { 
  glbUrl: string | null;
  dimensions?: any;
  onModelDimensionsDetected: any;
  onReset?: () => void;
  onError?: () => void;
  isOptimizing?: boolean;
  userTier?: string;
  isAdmin?: boolean;
}) {
  const vRef = useRef<any>(null);
  const l1 = useRef<any>(null);
  const l2 = useRef<any>(null);
  const l3 = useRef<any>(null);
  const syncRunning = useRef(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const hasDetected = useRef(false);

  // V22: Reset detection lock when the GLB changes
  useEffect(() => {
    hasDetected.current = false;
  }, [glbUrl]);

  const sync = useCallback(() => {
    const v = vRef.current;
    if (!v) return;
    const up = (l: any, s1: string, s2: string) => {
      const h1 = v.queryHotspot(`hotspot-${s1}`);
      const h2 = v.queryHotspot(`hotspot-${s2}`);
      if (h1?.canvasPosition && h2?.canvasPosition && l.current) {
        l.current.setAttribute('x1', h1.canvasPosition.x);
        l.current.setAttribute('y1', h1.canvasPosition.y);
        l.current.setAttribute('x2', h2.canvasPosition.x);
        l.current.setAttribute('y2', h2.canvasPosition.y);
        l.current.style.opacity = '1';
      } else if (l.current) {
        l.current.style.opacity = '0';
      }
    };
    up(l1, 'hp1', 'hp2');
    up(l2, 'hp3', 'hp4');
    up(l3, 'hp5', 'hp6');
    
    if (syncRunning.current) {
      requestAnimationFrame(sync);
    }
  }, []);

  useEffect(() => {
    syncRunning.current = true;
    requestAnimationFrame(sync);
    return () => { syncRunning.current = false; };
  }, [sync]);

  const detectCallbackRef = useRef(onModelDimensionsDetected);
  useEffect(() => {
    detectCallbackRef.current = onModelDimensionsDetected;
  }, [onModelDimensionsDetected]);

  useEffect(() => {
    const v = vRef.current;
    if (!v || !glbUrl) return;

    const run = () => {
      const v = vRef.current;
      if (!v || hasDetected.current) return;

      try {
        let size = v.getDimensions ? v.getDimensions() : { x: 0, y: 0, z: 0 };
        if ((!size || size.x === 0) && v.model) {
          if (typeof v.model.getDimensions === 'function') {
            const s = v.model.getDimensions();
            size = { x: s.x, y: s.y, z: s.z };
          } else if (v.model.boundingBox) {
            const { min, max } = v.model.boundingBox;
            size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
          }
        }

        if (!size || (size.x === 0 && size.y === 0 && size.z === 0)) return;

        hasDetected.current = true;
        console.log("[ModelPreview3D] Final Identity Anchor Activated:", size);

        let center = v.getBoundingBoxCenter ? v.getBoundingBoxCenter() : { x: 0, y: 0, z: 0 };
        if (center.x === 0 && center.y === 0 && center.z === 0 && v.model?.boundingBox) {
          const { min, max } = v.model.boundingBox;
          center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
        }

        const parseDim = (val: any) => {
          if (typeof val === 'number') return val;
          const n = parseFloat(val);
          return isNaN(n) ? 0 : n;
        };
        const pL = parseDim(dimensions.length);
        const pW = parseDim(dimensions.width);
        const pH = parseDim(dimensions.height);

        // V132: Reference-Based Hotspot Locking
        // Use server-provided dimensions if they are non-zero (ignores watermark bounds)
        const finalSize = (pL > 0 && pW > 0 && pH > 0) 
          ? { x: pL, y: pH, z: pW } 
          : size;

        if (detectCallbackRef.current) {
          detectCallbackRef.current({ length: size.x, height: size.y, width: size.z });
        }

        const min = { x: center.x - finalSize.x / 2, y: center.y - finalSize.y / 2, z: center.z - finalSize.z / 2 };
        const max = { x: center.x + finalSize.x / 2, y: center.y + finalSize.y / 2, z: center.z + finalSize.z / 2 };

        const set = (n: string, p: string) => v.updateHotspot({ name: `hotspot-${n}`, position: p });
        set('hp1', `${min.x} ${max.y} ${min.z}m`);
        set('hp2', `${max.x} ${max.y} ${min.z}m`);
        set('l1', `${center.x} ${max.y} ${min.z}m`);
        set('hp3', `${max.x} ${min.y} ${min.z}m`);
        set('hp4', `${max.x} ${max.y} ${min.z}m`);
        set('l2', `${max.x} ${center.y} ${min.z}m`);
        set('hp5', `${max.x} ${min.y} ${min.z}m`);
        set('hp6', `${max.x} ${min.y} ${max.z}m`);
        set('l3', `${max.x} ${min.y} ${center.z}m`);

      } catch (err) {
        console.error("[ModelPreview3D] Detection Error:", err);
      }
    };

    v.addEventListener('load', () => {
       setLoadError(false);
       // V176: Increased delay to ensure model-viewer has updated its internal bounding box
       setTimeout(run, 200);
    });
    v.addEventListener('error', (e: any) => {
       console.error("[ModelPreview3D] Model failed to load:", e);
       setLoadError(true);
       if (onError) onError();
    });
    if (v.loaded) setTimeout(run, 200);
    
    // Interval fallback to ensure detection triggers
    const i = setInterval(() => {
       if (hasDetected.current) clearInterval(i);
       else run();
    }, 1000); 

    return () => { 
      clearInterval(i); 
    };
  }, [glbUrl, JSON.stringify(dimensions)]); 

  if (loadError) {
    return (
      <div className="w-full h-[500px] bg-gray-50 flex flex-col items-center justify-center text-center p-6 rounded-[2rem] border-2 border-dashed border-red-200">
        <CubeTransparentIcon className="w-12 h-12 text-red-400 mb-4 animate-pulse" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Failed to Load 3D Model</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">The model file might be corrupted or inaccessible. Try uploading it again.</p>
        <div className="flex gap-4">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-colors"
          >
            Reload Page
          </button>
          {onReset && (
            <button 
              onClick={onReset}
              className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 transition-colors"
            >
              Reset & Upload New
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!glbUrl) return <div className="w-full h-[500px] bg-white flex items-center justify-center text-gray-300 rounded-[2rem] border-2 border-dashed border-gray-100">No Model Selected</div>;

  return (
    <div className="relative w-full h-[500px] bg-white border-none rounded-[2rem] overflow-hidden">
      <style>{`
        .dot { 
          width: 8px; 
          height: 8px; 
          border: 1px solid #000; 
          border-radius: 50%; 
          background: #fff; 
          pointer-events: none; 
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          position: absolute;
          transform: translate(-50%, -50%);
        }
        .lbl { 
          background: #fff; 
          border: 1px solid #333; 
          padding: 2px 8px; 
          border-radius: 4px; 
          font-weight: 500; 
          font-family: sans-serif; 
          pointer-events: none; 
          font-size: 11px; 
          color: #000; 
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin: 0;
          box-sizing: border-box;
          min-width: 40px;
          height: 22px;
          position: absolute;
          transform: translate(-50%, -100%);
        }
        .lbl-y { transform: translate(50%, -50%); }
      `}</style>
      <model-viewer ref={vRef} src={glbUrl} camera-controls auto-rotate bounds="tight" exposure="1.2" shadow-intensity="1.5" environment-image="neutral" style={{ width: '100%', height: '100%', background: '#f3f4f6', margin: 0, padding: 0 }}>
        {showDimensions && (
          <>
            <div slot="hotspot-hp1" className="dot" /> <div slot="hotspot-hp2" className="dot" />
            <div slot="hotspot-hp3" className="dot" /> <div slot="hotspot-hp4" className="dot" />
            <div slot="hotspot-hp5" className="dot" /> <div slot="hotspot-hp6" className="dot" />
            <div slot="hotspot-l1" className="lbl lbl-x">{dimensions.length}</div>
            <div slot="hotspot-l2" className="lbl lbl-y">{dimensions.height}</div>
            <div slot="hotspot-l3" className="lbl lbl-z">{dimensions.width}</div>
          </>
        )}
      </model-viewer>

      {/* V123: CSS Watermark Force-Removed by User Request */}
      
      <button
        onClick={() => setShowDimensions(!showDimensions)}
        className={`absolute bottom-4 right-4 z-[5000] flex items-center gap-2 bg-white border-2 rounded-[14px] px-4 py-1.5 shadow-md hover:scale-105 transition-all ${showDimensions ? 'border-[#00A651]' : 'border-gray-300'}`}
      >
        <span className={`font-bold text-[15px] tracking-wide ${showDimensions ? 'text-[#00A651]' : 'text-gray-400'}`}>Dimensions</span>
        {showDimensions ? (
          <EyeIcon className="w-5 h-5 text-[#00A651]" />
        ) : (
          <EyeSlashIcon className="w-5 h-5 text-gray-400" />
        )}
      </button>
      <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 10, margin: 0, padding: 0 }}>
        <line ref={l1} stroke="#000" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" style={{ transition: 'opacity 0.2s' }} />
        <line ref={l2} stroke="#000" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" style={{ transition: 'opacity 0.2s' }} />
        <line ref={l3} stroke="#000" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" style={{ transition: 'opacity 0.2s' }} />
      </svg>
    </div>
  );
}
