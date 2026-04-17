"use client";
import { useState, useMemo } from "react";
import ManualUpload from "./ManualUpload";
import { CloudArrowUpIcon, ArrowPathIcon, PlusIcon, MinusIcon, ArrowDownTrayIcon } from "@heroicons/react/24/solid";
import { CubeTransparentIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import ModelPreview3D from "./ModelPreview3D";
import axios from "axios";

/** Proxy S3 URLs through Next.js to avoid browser CORS blocks */
const toProxied = (url: string | null): string | null => {
  if (!url) return null;
  
  // STABILITY LOCK: Never proxy links from your local Python backend.
  // This bypasses the flaky cloud proxy completely for the preview.
  if (url.includes("localhost:5001") || url.includes("127.0.0.1:5001")) {
    return url;
  }

  // If it's a localhost from another port, load directly
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return url;
  }

  // All other remote URLs go through the proxy to bypass CORS blocks
  return `/api/proxy-model?url=${encodeURIComponent(url)}`;
};

export default function UploadSection() {
  const [glbFile, setGlbFile] = useState<string | null>(null);
  const [usdzFile, setUsdzFile] = useState<string | null>(null);
  const [glbFileKey, setGlbFileKey] = useState<string | null>(null);
  const [usdzFileKey, setUsdzFileKey] = useState<string | null>(null);
  const [glbFileName, setGlbFileName] = useState<string | null>(null);
  const [localGlbUrl, setLocalGlbUrl] = useState<string | null>(null);
  const [usdzFileName, setUsdzFileName] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ length: "0ft", width: "0ft", height: "0ft" });
  const [dimensionUnit, setDimensionUnit] = useState("feet");
  const [dimensionInputs, setDimensionInputs] = useState({ length: "", width: "", height: "" });
  const [rawModelDimensions, setRawModelDimensions] = useState<{length: number, width: number, height: number} | null>(null);
  const [scaleValue, setScaleValue] = useState("");
  const [resizeMode, setResizeMode] = useState<"manual" | "scale">("manual");
  const [isResizing, setIsResizing] = useState(false);
  const [originalDimensions, setOriginalDimensions] = useState<any>(null);
  const [originalGlbUrl, setOriginalGlbUrl] = useState<string | null>(null);
  const [originalGlbKey, setOriginalGlbKey] = useState<string | null>(null);
  const [originalGlbFileName, setOriginalGlbFileName] = useState<string | null>(null);
  const [isConvertingUSDZ, setIsConvertingUSDZ] = useState(false);
  const [convertedUsdzUrl, setConvertedUsdzUrl] = useState<string | null>(null);

  const handleGLBUpload = (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => {
    setGlbFile(fileUrl.split('?')[0]);
    setGlbFileKey(fileKey);
    setGlbFileName(fileName);
    if (fileBlobUrl) setLocalGlbUrl(fileBlobUrl);
    setOriginalGlbUrl(fileUrl);
    setOriginalGlbKey(fileKey);
    setOriginalGlbFileName(fileName);
    setOriginalDimensions(null);
    setDimensionInputs({ length: "", width: "", height: "" });
    setDimensions({ length: "0ft", width: "0ft", height: "0ft" });
    setDimensionUnit("feet");
    setScaleValue("");
    setConvertedUsdzUrl(null);
  };

  const handleUSDZUpload = (fileUrl: string, fileKey: string, fileName: string) => {
    setUsdzFile(fileUrl);
    setUsdzFileKey(fileKey);
    setUsdzFileName(fileName);
  };

  const convertDimension = (value: string, fromUnit: string, toUnit: string): string => {
    if (!value || value === "") return "";
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return "";
    const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };
    const inMm = numValue * (toMm[fromUnit] || 1);
    const result = inMm / (toMm[toUnit] || 1);
    return (Math.round(result * 100) / 100).toString();
  };

  const handleUnitChange = (newUnit: string) => {
    const fmt = (val: string) => {
      if (!val || val === "") return "";
      const n = parseFloat(val);
      return isNaN(n) ? "" : (Math.round(n * 100) / 100).toString();
    };
    const converted = {
      length: fmt(convertDimension(dimensionInputs.length, dimensionUnit, newUnit)),
      width: fmt(convertDimension(dimensionInputs.width, dimensionUnit, newUnit)),
      height: fmt(convertDimension(dimensionInputs.height, dimensionUnit, newUnit)),
    };
    setDimensionInputs(converted);
    setDimensionUnit(newUnit);
  };

  const incrementScale = () => {
    const current = parseFloat(scaleValue) || 1.0;
    setScaleValue((current + 0.1).toFixed(1));
  };

  const decrementScale = () => {
    const current = parseFloat(scaleValue) || 1.0;
    if (current > 0.1) {
      setScaleValue((current - 0.1).toFixed(1));
    }
  };

  const liveDimensions = useMemo(() => {
    const unitLabel: Record<string, string> = { millimeters: "mm", centimeters: "cm", inches: "in", feet: "ft", meters: "m" };
    const unitSuffix = unitLabel[dimensionUnit] || "m";
    
    // Always use current input values as the base
    let l = parseFloat(dimensionInputs.length) || 0;
    let w = parseFloat(dimensionInputs.width) || 0;
    let h = parseFloat(dimensionInputs.height) || 0;

    // Apply scale factor only if we have a valid positive scale value
    if (resizeMode === "scale" && scaleValue && parseFloat(scaleValue) > 0) {
      const s = parseFloat(scaleValue);
      l *= s; w *= s; h *= s;
    }
    
    return {
      length: `${l.toFixed(2)}${unitSuffix}`,
      width: `${w.toFixed(2)}${unitSuffix}`,
      height: `${h.toFixed(2)}${unitSuffix}`,
    };
  }, [resizeMode, scaleValue, dimensionInputs, dimensionUnit]);

  const handleApply = async () => {
    if (!glbFileKey) {
      toast.error("No GLB file to edit.");
      return;
    }
    const l = parseFloat(liveDimensions.length);
    const w = parseFloat(liveDimensions.width);
    const h = parseFloat(liveDimensions.height);
    if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0) {
      toast.error("Please enter valid dimensions.");
      return;
    }

    if (!originalDimensions) setOriginalDimensions({ ...dimensionInputs });
    setIsResizing(true);
    
    try {
      // OPTIMIZATION: Check if dimensions actually changed since last apply
      const currentDims = JSON.stringify({ l, w, h, unit: dimensionUnit });
      if ((window as any)._lastAppliedDims === currentDims) {
        toast.success("Dimensions already applied!", { id: "res" });
        setIsResizing(false);
        return;
      }

      toast.loading("Optimizing & Baking Design...", { id: "res" });
      
      // ALWAYS use the original file as the source to preserve texture quality
      // and break the "white model" loop.
      const fUrl = toProxied(originalGlbUrl) || toProxied(glbFile)!;
      const fRes = await fetch(fUrl);
      const fBlob = await fRes.blob();
      
      const fd = new FormData();
      fd.append('file', fBlob, glbFileName || "model.glb");
      fd.append('width', l.toString());
      fd.append('height', h.toString());
      fd.append('depth', w.toString());
      
      const unitMap: Record<string, string> = { 
        feet: "ft", inches: "in", centimeters: "cm", meters: "m", millimeters: "mm" 
      };
      fd.append('unit', unitMap[dimensionUnit] || "m");

      // The backend now centers the model at (0,0,0) and bakes the scale!
      // Increase timeout to 120s for heavy 3D processing tasks
      const apiRes = await axios.post("/api/resize", fd, { timeout: 120000 });
      
      if (apiRes.data.success) {
        const proxiedUrl = toProxied(apiRes.data.glb_url);
        setLocalGlbUrl(proxiedUrl);
        setGlbFile(proxiedUrl);
        setGlbFileKey(apiRes.data.file_key);
        (window as any)._lastAppliedDims = currentDims;
        toast.success("Ready!", { id: "res" });
      }
        
        // Sync the input boxes with the applied values
        const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
        setDimensionInputs({
          length: fmt(l),
          width: fmt(w),
          height: fmt(h)
        });
        setDimensions(liveDimensions);
        setScaleValue("");
        setConvertedUsdzUrl(null);
        toast.success("Done!", { id: "res" });
    } catch (e) {
      console.error(e);
      toast.error("Resize failed. Check backend connection.", { id: "res" });
    } finally {
      setIsResizing(false);
    }
  };

  const handleReset = () => {
    if (!originalGlbUrl) return;
    setGlbFile(originalGlbUrl.split('?')[0]);
    setGlbFileKey(originalGlbKey);
    setGlbFileName(originalGlbFileName);
    if (originalDimensions) setDimensionInputs(originalDimensions);
    setScaleValue("");
    setConvertedUsdzUrl(null);
    toast.success("Reset Complete!");
  };

  const handleDownload = async (url: string, fileName: string, draco = false) => {
    try {
      toast.loading("Fetching...", { id: "dl" });
      const r = await fetch(url);
      let b = await r.blob();
      if (draco) {
        const { compressGLB } = await import('../utils/glbCompressor');
        b = await compressGLB(new File([b], fileName));
      }
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(b);
      a.download = fileName;
      a.click();
      toast.success("Ready!", { id: "dl" });
    } catch (e) { toast.error("Failed."); }
  };

  const handleConvert = async () => {
    if (isConvertingUSDZ || !glbFileKey) return;
    setIsConvertingUSDZ(true);
    try {
      toast.loading("Converting...", { id: "usdz" });
      const fd = new FormData();
      fd.append("s3_key", glbFileKey);

      // Priority:
      // 1. localGlbUrl that is a real server URL (post-resize: http://localhost:5001/download/...)
      // 2. glbFile (S3 URL with presigned params)
      // NOTE: blob: URLs are browser-local and cannot be fetched by the Python backend.
      const isServerUrl = (u: string | null) =>
        !!u && (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"));

      const glbUrlToSend = isServerUrl(localGlbUrl) ? localGlbUrl : glbFile;
      if (glbUrlToSend) fd.append("glb_url", glbUrlToSend);

      console.log("[handleConvert] s3_key:", glbFileKey, " glb_url:", glbUrlToSend?.slice(0, 80));

      const res = await axios.post("http://localhost:5001/api/convert-usdz", fd);
      
      if (!res.data || !res.data.success) {
        throw new Error(res.data?.error || "Unknown backend failure");
      }

      const downloadUrl = res.data.file_url || res.data.url;
      if (!downloadUrl) {
         throw new Error("Missing file URL in backend response");
      }

      setConvertedUsdzUrl(downloadUrl);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = res.data.filename || "model.usdz";
      a.click();
      toast.success("Converted!", { id: "usdz" });
    } catch (e: any) {
      console.error("[handleConvert] error:", e?.response?.data || e?.message);
      toast.error("Failed. Check backend terminal for details.", { id: "usdz" });
    } finally {
      setIsConvertingUSDZ(false);
    }
  };


  const handleDetected = (d: { length: number; width: number; height: number }) => {
    setRawModelDimensions(d);
    if (dimensionInputs.length) return;
    const factor = { meters: 1, millimeters: 0.001, centimeters: 0.01, inches: 0.0254, feet: 0.3048 }[dimensionUnit] || 1;
    setDimensionInputs({
      length: (Math.round((d.length / factor) * 100) / 100).toString(),
      width: (Math.round((d.width / factor) * 100) / 100).toString(),
      height: (Math.round((d.height / factor) * 100) / 100).toString(),
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-3 border border-gray-100">
      <div className="flex items-center gap-2 mb-3 bg-gradient-to-r from-blue-50 to-purple-50 p-2 rounded-lg">
        <div className="p-1.5 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg shadow-md">
          <CloudArrowUpIcon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">3D Model Editor</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-2">
          <ManualUpload onGLBUpload={handleGLBUpload} onUSDZUpload={handleUSDZUpload} currentGlbUrl={glbFile} currentUsdzUrl={usdzFile} glbFileName={glbFileName} usdzFileName={usdzFileName} />
        </div>

        <div className="flex flex-col min-h-[300px] lg:min-h-[400px]">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Preview</h3>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-200 to-purple-200 rounded-full"></div>
          </div>
          <div className="flex-1 relative min-h-[240px] md:min-h-[280px] bg-gradient-to-br from-blue-100 to-purple-100 p-0.5 rounded-lg overflow-hidden flex flex-col">
            <div className="flex-1 bg-white rounded-lg overflow-hidden relative flex flex-col items-center justify-center shadow-inner border border-gray-100">
              {glbFile ? (
                <>
                  <ModelPreview3D 
                    key={originalGlbUrl}
                    glbUrl={localGlbUrl || toProxied(glbFile)!} 
                    dimensions={liveDimensions} 
                    unit={dimensionUnit === "feet" ? "ft" : dimensionUnit === "inches" ? "in" : dimensionUnit === "meters" ? "m" : dimensionUnit === "millimeters" ? "mm" : "cm"}
                    onModelDimensionsDetected={handleDetected} 
                    isOptimizing={isResizing}
                  />
                  {/* PREMIUM LOADING OVERLAY */}
                  {isResizing && (
                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[6px] z-50 flex flex-col items-center justify-center transition-all duration-300">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-200 border-t-purple-600 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full animate-pulse shadow-lg"></div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-center animate-bounce">
                        <p className="text-sm font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent uppercase tracking-[0.2em]">Optimizing Model</p>
                        <div className="flex gap-1 mt-1">
                          {[0, 1, 2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                  <CubeTransparentIcon className="w-8 h-8 opacity-40 text-blue-600" />
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 text-blue-900">Awaiting Model</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Edit Dimensions</h3>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-200 to-purple-200 rounded-full"></div>
          </div>
          <div className="flex-1 flex flex-col gap-3 p-3 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
            <div className="flex p-1 bg-white rounded-lg shadow-sm">
              <button onClick={() => setResizeMode("manual")} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${resizeMode === "manual" ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md" : "text-gray-500"}`}>Manual</button>
              <button onClick={() => setResizeMode("scale")} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${resizeMode === "scale" ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md font-black" : "text-gray-500"}`}>Scale</button>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-700">Units</label>
              <select value={dimensionUnit} onChange={(e) => handleUnitChange(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white text-sm">
                {["feet", "meters", "millimeters", "centimeters", "inches"].map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
              </select>
            </div>

            {resizeMode === "scale" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Scale Factor</label>
                <div className="flex items-center gap-1">
                  <button onClick={decrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white"><MinusIcon className="w-3 h-3"/></button>
                  <input type="text" value={scaleValue} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setScaleValue(e.target.value)} className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold" placeholder="1.0" />
                  <button onClick={incrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white"><PlusIcon className="w-3 h-3"/></button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-700">Target Dimensions</label>
              <div className="grid grid-cols-3 gap-2">
{["length", "width", "height"].map(dim => {
  const axisMap: Record<string, string> = { length: "X", width: "Z", height: "Y" };
  const val = dimensionInputs[dim as keyof typeof dimensionInputs];
  const s = parseFloat(scaleValue) || 1.0;
  const res = resizeMode === "scale" ? (parseFloat(val) || 0) * s : parseFloat(val) || 0;
  return (
    <div key={dim} className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-500 text-center uppercase">
        {dim} ({axisMap[dim]})
      </label>
      <input 
        type="text" 
        value={val} 
        onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setDimensionInputs(p => ({...p, [dim]: e.target.value}))} 
        disabled={resizeMode === "scale"} 
        className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-xs disabled:bg-gray-100" 
      />
      <div className="text-center text-[10px] font-black text-blue-700">{(Math.round(res * 100) / 100).toString()}</div>
    </div>
  );
})}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              <div className="flex gap-2">
                <button onClick={handleApply} disabled={isResizing || !glbFileKey} className="flex-1 py-2 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-sm shadow-md transition-all active:scale-95">Apply</button>
                <button onClick={handleReset} className="flex-1 py-2 rounded-lg border-2 border-amber-500 text-amber-600 font-bold text-sm flex items-center justify-center gap-1 transition-all hover:bg-amber-50"><ArrowPathIcon className="w-4 h-4" /> Reset</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(toProxied(glbFile)!, "model.glb")} disabled={!glbFile} className="flex-1 py-2 rounded-lg bg-white border-2 border-purple-500 text-purple-700 font-bold text-xs flex items-center justify-center gap-1"><ArrowDownTrayIcon className="w-3 h-3" /> GLB</button>
                <button onClick={() => handleDownload(toProxied(glbFile)!, "model.glb", true)} disabled={!glbFile} className="flex-[2] py-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-md transition-all active:scale-95"><ArrowDownTrayIcon className="w-4 h-4" /> Download Optimized (Draco)</button>
              </div>
              <button onClick={handleConvert} className="w-full py-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"><ArrowDownTrayIcon className="w-4 h-4" /> Convert to USDZ</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
