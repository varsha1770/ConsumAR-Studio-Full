'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface ModelPreviewProps {
  dimensions?: { length: string; width: string; height: string };
  unit?: string;
  glbUrl: string;
  isOptimizing: boolean;
  onModelDimensionsDetected?: (dims: { length: number; height: number; width: number }) => void;
}

export default function ModelPreview({ 
  glbUrl, 
  dimensions = { length: "0", width: "0", height: "0" }, 
  onModelDimensionsDetected 
}: ModelPreviewProps) {
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelViewerRef = useRef<any>(null);
  const line1Ref = useRef<SVGLineElement>(null);
  const line2Ref = useRef<SVGLineElement>(null);
  const line3Ref = useRef<SVGLineElement>(null);

  const sync = useCallback(() => {
    const v = modelViewerRef.current;
    if (!v) return;

    const upLine = (line: SVGLineElement | null, p1: string, p2: string) => {
      if (!line) return;
      const h1 = v.queryHotspot(p1);
      const h2 = v.queryHotspot(p2);
      
      if (h1?.canvasPosition && h2?.canvasPosition) {
        line.setAttribute('x1', h1.canvasPosition.x.toString());
        line.setAttribute('y1', h1.canvasPosition.y.toString());
        line.setAttribute('x2', h2.canvasPosition.x.toString());
        line.setAttribute('y2', h2.canvasPosition.y.toString());
        line.style.opacity = '1';
        line.style.display = 'block';
      }
    };

    upLine(line1Ref.current, 'hp1', 'hp2');
    upLine(line2Ref.current, 'hp3', 'hp4');
    upLine(line3Ref.current, 'hp5', 'hp6');

    requestAnimationFrame(sync);
  }, []);

  useEffect(() => {
    const v = modelViewerRef.current;
    if (!v) return;

    const runCalibration = () => {
      const model = v.model;
      if (!model?.boundingBox) return;
      
      const { min, max } = model.boundingBox;
      const d = v.getDimensions();
      
      if (onModelDimensionsDetected && d.x > 0.001) {
        onModelDimensionsDetected({ length: d.x, height: d.y, width: d.z });
      }

      const g = 0.08;
      const setH = (n: string, p: string) => v.updateHotspot({ name: n, position: p });

      setH('hp1', `${min.x} ${max.y + g} ${max.z}m`);
      setH('hp2', `${max.x} ${max.y + g} ${max.z}m`);
      setH('l1', `${(min.x + max.x)/2} ${max.y + g + 0.08} ${max.z}m`);

      setH('hp3', `${max.x + g} ${min.y} ${max.z}m`);
      setH('hp4', `${max.x + g} ${max.y} ${max.z}m`);
      setH('l2', `${max.x + g + 0.08} ${(min.y + max.y)/2} ${max.z}m`);

      setH('hp5', `${max.x} ${min.y - g} ${min.z}m`);
      setH('hp6', `${max.x} ${min.y - g} ${max.z}m`);
      setH('l3', `${max.x + 0.12} ${min.y - g} ${(min.z + max.z)/2}m`);

      if (!modelLoaded) setModelLoaded(true);
      sync();
    };

    v.addEventListener('load', runCalibration);
    if (v.loaded) runCalibration();
    
    const interval = setInterval(runCalibration, 1000);
    const failsafe = setTimeout(() => setModelLoaded(true), 10000);

    return () => {
      v.removeEventListener('load', runCalibration);
      clearInterval(interval);
      clearTimeout(failsafe);
    };
  }, [glbUrl, onModelDimensionsDetected, sync, modelLoaded]);

  return (
    <div className="relative w-full h-[600px] bg-white" style={{ background: 'white !important' }}>
      <style jsx>{`
        .p-dot { width: 10px; height: 10px; border: 2.5px solid black; border-radius: 50%; background: white; pointer-events: none; z-index: 50; }
        .p-label { background: white; border: 2.5px solid black; padding: 7px 15px; border-radius: 12px; font-weight: 900; font-size: 15px; color: black; pointer-events: none; white-space: nowrap; z-index: 100; }
        model-viewer { width: 100%; height: 100%; background: white !important; }
      `}</style>
      
      <model-viewer
        ref={modelViewerRef}
        src={glbUrl}
        camera-controls
        auto-rotate
        bounds="tight"
        exposure="1.2"
        shadow-intensity="1.5"
        environment-image="neutral"
        style={{ width: '100%', height: '100%' }}
      >
        <div slot="hp1" className="p-dot" /> <div slot="hp2" className="p-dot" />
        <div slot="hp3" className="p-dot" /> <div slot="hp4" className="p-dot" />
        <div slot="hp5" className="p-dot" /> <div slot="hp6" className="p-dot" />
        <div slot="l1" className="p-label">{dimensions.length}</div>
        <div slot="l2" className="p-label">{dimensions.height}</div>
        <div slot="l3" className="p-label">{dimensions.width}</div>
      </model-viewer>

      <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 1000 }}>
        <line ref={line1Ref} stroke="black" strokeWidth="2.5" strokeDasharray="9,6" />
        <line ref={line2Ref} stroke="black" strokeWidth="2.5" strokeDasharray="9,6" />
        <line ref={line3Ref} stroke="black" strokeWidth="2.5" strokeDasharray="9,6" />
      </svg>
    </div>
  );
}
