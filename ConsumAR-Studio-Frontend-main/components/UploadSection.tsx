"use client";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ManualUpload from "./ManualUpload";
import { ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/solid";
import { CubeTransparentIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import ModelPreview3D from "./ModelPreview3D";
import axios from "axios";

// New Modular Components
import HeroSection from "./HeroSection";
import EditorControls from "./EditorControls";
import FaqSection from "./FaqSection";

const toProxied = (url: string | null): string | null => {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('/api/proxy-model')) return url;
  return `/api/proxy-model?url=${encodeURIComponent(url)}`;
};

const unitLabel: Record<string, string> = { millimeters: "mm", centimeters: "cm", inches: "in", feet: "ft", meters: "m" };

export default function UploadSection() {
  const router = useRouter();
  const { data: session } = useSession();
  
  // State
  const [glbFile, setGlbFile] = useState<string | null>(null);
  const [glbFileKey, setGlbFileKey] = useState<string | null>(null);
  const [glbFileName, setGlbFileName] = useState<string | null>(null);
  const [localGlbUrl, setLocalGlbUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ length: "0ft", width: "0ft", height: "0ft" });
  const [dimensionUnit, setDimensionUnit] = useState("meters");
  const [dimensionInputs, setDimensionInputs] = useState({ length: "", width: "", height: "" });
  const [rawModelDimensions, setRawModelDimensions] = useState<{length: number, width: number, height: number} | null>(null);
  const [scaleValue, setScaleValue] = useState("");
  const [resizeMode, setResizeMode] = useState<"manual" | "scale">("manual");
  const [isResizing, setIsResizing] = useState(false);
  const [originalDimensions, setOriginalDimensions] = useState<any>(null);
  const [originalDimensionUnit, setOriginalDimensionUnit] = useState<string>("meters");
  const [originalGlbUrl, setOriginalGlbUrl] = useState<string | null>(null);
  const [originalGlbKey, setOriginalGlbKey] = useState<string | null>(null);
  const [originalGlbFileName, setOriginalGlbFileName] = useState<string | null>(null);
  const [isConvertingUSDZ, setIsConvertingUSDZ] = useState(false);
  const [convertedUsdzUrl, setConvertedUsdzUrl] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string>("NON_LOGGED");
  const [usageStats, setUsageStats] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [hasLoadError, setHasLoadError] = useState(false);
  const [forceWatermark, setForceWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState("TryitFirstLabs");
  const [previewVersion, setPreviewVersion] = useState(0);

  const isSuperAdmin = userTier === "SUPER_ADMIN" || (session?.user as any)?.isAdmin === true;

  const triggerUpgrade = (msg?: string) => {
    if (isSuperAdmin) return;
    if (msg) setUpgradeMessage(msg);
    else if (userTier === "NON_LOGGED") setUpgradeMessage("You've used your free guest limit. Note: Deleting models will NOT reset your quota. Join or Sign in to get 3 more rescales!");
    else setUpgradeMessage("Limit Reached! You've used your free daily rescale/conversion allowance. Note: Deleting files does NOT restore your quota. Upgrade to Pro for 250 monthly rescales, unlimited USDZ, and all dimension units!");
    setShowUpgradeModal(true);
  };

  // Visibility Lock
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') console.log("[PersistenceLock] Tab visible.");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Fetch Limits
  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const res = await axios.get("/api/user/limits");
        if (res.data.success) {
          setUserTier(res.data.tier);
          setUsageStats(res.data.usage);
        }
      } catch (err) { console.error("Failed to fetch limits", err); }
    };
    fetchLimits();
  }, [session]);

  // Settings Loader
  const hasLoadedSettings = useRef(false);
  useEffect(() => {
    if (session && !hasLoadedSettings.current) {
      const loadSettings = async () => {
        try {
          const res = await axios.get("/api/user-settings");
          if (res.data.success && res.data.settings) {
            const s = res.data.settings;
            hasLoadedSettings.current = true;
            const isLocalZero = parseFloat(dimensions.length) === 0 && parseFloat(dimensions.width) === 0 && parseFloat(dimensions.height) === 0;
            if (isLocalZero) {
                if (s.dimensions) setDimensions(s.dimensions);
                if (s.dimensionUnit) setDimensionUnit(s.dimensionUnit);
                if (s.scaleValue) setScaleValue(s.scaleValue);
                if (s.dimensions) {
                   setDimensionInputs({
                     length: (parseFloat(s.dimensions.length) || 0).toString(),
                     width: (parseFloat(s.dimensions.width) || 0).toString(),
                     height: (parseFloat(s.dimensions.height) || 0).toString()
                   });
                }
            }
          }
        } catch (e) { console.error("The Butler failed:", e); }
      };
      loadSettings();
    }
  }, [session]);

  const saveSettings = async (overrides = {}) => {
    if (!session) return;
    try {
      const current = { glbFile, glbFileKey, glbFileName, dimensions, dimensionUnit, scaleValue, ...overrides };
      await axios.post("/api/user-settings", current);
    } catch (e) { console.error("The Butler failed:", e); }
  };

  const clearBrokenModel = async () => {
    setHasLoadError(false);
    setGlbFile(null);
    setGlbFileKey(null);
    setGlbFileName(null);
    setLocalGlbUrl(null);
    setOriginalGlbUrl(null);
    setOriginalGlbKey(null);
    setOriginalGlbFileName(null);
    setDimensions({ length: "0ft", width: "0ft", height: "0ft" });
    setDimensionInputs({ length: "", width: "", height: "" });
    if (session) await axios.post("/api/user-settings", { glbFile: null, glbFileKey: null, glbFileName: null });
    toast.success("Editor reset. You can now upload a fresh model.");
  };

  const handleViewerError = () => {
    console.log("[Studio] Viewer reported error. Reverting to upload page...");
    setHasLoadError(true);
    setTimeout(() => {
       clearBrokenModel();
    }, 2000);
  };

  const handleGLBUpload = (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => {
    console.log("[Studio] New Upload:", { fileUrl, fileKey, fileName, hasBlob: !!fileBlobUrl });
    const cleanUrl = fileUrl.split('?')[0];
    setGlbFile(cleanUrl);
    setGlbFileKey(fileKey);
    setGlbFileName(fileName);
    if (fileBlobUrl) {
      console.log("[Studio] Using local blob for preview:", fileBlobUrl);
      setLocalGlbUrl(fileBlobUrl);
    }
    setOriginalGlbUrl(fileUrl);
    setOriginalGlbKey(fileKey);
    setOriginalGlbFileName(fileName);
    setOriginalDimensions(null);
    setRawModelDimensions(null);
    setDimensionInputs({ length: "", width: "", height: "" });
    const unitSuffix = unitLabel[dimensionUnit] || "ft";
    const initialDims = { length: `0${unitSuffix}`, width: `0${unitSuffix}`, height: `0${unitSuffix}` };
    setDimensions(initialDims);
    setScaleValue("");
    setConvertedUsdzUrl(null);
    saveSettings({ glbFile: cleanUrl, glbFileKey: fileKey, glbFileName: fileName, dimensions: initialDims, scaleValue: "" });
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
    if (!isSuperAdmin && userTier === "NON_LOGGED" && newUnit !== "centimeters") {
      triggerUpgrade("Sign in to access other measurement units like Feet, Inches, and Meters!");
      return;
    }
    if (!isSuperAdmin && userTier === "FREE" && ["meters", "millimeters", "inches"].includes(newUnit)) {
      triggerUpgrade("Upgrade to Pro to access premium units like Meters, Millimeters, and Inches!");
      return;
    }
    const fmt = (val: string) => {
      const n = parseFloat(val);
      return isNaN(n) ? "" : (Math.round(n * 100) / 100).toString();
    };
    const l = fmt(convertDimension(dimensionInputs.length, dimensionUnit, newUnit));
    const w = fmt(convertDimension(dimensionInputs.width, dimensionUnit, newUnit));
    const h = fmt(convertDimension(dimensionInputs.height, dimensionUnit, newUnit));
    const converted = { length: l, width: w, height: h };
    setDimensionInputs(converted);
    setDimensionUnit(newUnit);
    saveSettings({
      dimensionUnit: newUnit,
      dimensions: {
        length: `${l}${unitLabel[newUnit]}`,
        width: `${w}${unitLabel[newUnit]}`,
        height: `${h}${unitLabel[newUnit]}`
      }
    });
  };

  const incrementScale = () => setScaleValue(((parseFloat(scaleValue) || 1.0) + 0.1).toFixed(1));
  const decrementScale = () => {
    const current = parseFloat(scaleValue) || 1.0;
    if (current > 0.1) setScaleValue((current - 0.1).toFixed(1));
  };

  const liveDimensions = useMemo(() => {
    const unitSuffix = unitLabel[dimensionUnit] || "m";
    let l = parseFloat(dimensionInputs.length) || 0;
    let w = parseFloat(dimensionInputs.width) || 0;
    let h = parseFloat(dimensionInputs.height) || 0;
    if (resizeMode === "scale" && scaleValue && parseFloat(scaleValue) > 0) {
      const s = parseFloat(scaleValue);
      const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };
      const factor = 1000 / (toMm[dimensionUnit] || 1000);
      l = (originalDimensions?.length || 0) * s * factor;
      w = (originalDimensions?.width || 0) * s * factor;
      h = (originalDimensions?.height || 0) * s * factor;
    }
    return { length: `${l.toFixed(2)}${unitSuffix}`, width: `${w.toFixed(2)}${unitSuffix}`, height: `${h.toFixed(2)}${unitSuffix}` };
  }, [resizeMode, scaleValue, dimensionInputs, dimensionUnit, originalDimensions]);

  const handleApply = async (forceWatermarkOverride?: boolean) => {
    if (!glbFileKey) return;
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
      const activeWatermark = forceWatermarkOverride !== undefined ? forceWatermarkOverride : forceWatermark;
      const currentDims = JSON.stringify({ l, w, h, unit: dimensionUnit, watermark: activeWatermark, text: watermarkText });
      
      if ((window as any)._lastAppliedDims === currentDims) {
        toast.success("Design already applied!", { id: "res" });
        setIsResizing(false);
        return;
      }
      toast.loading("Optimizing & Baking Design...", { id: "res" });
      const fUrl = toProxied(originalGlbUrl) || toProxied(glbFile)!;
      const fRes = await fetch(fUrl);
      const fBlob = await fRes.blob();
      const fd = new FormData();
      fd.append('file', fBlob, glbFileName || "model.glb");
      fd.append('width', l.toString());
      fd.append('height', h.toString());
      fd.append('depth', w.toString());
      const unitMap: Record<string, string> = { feet: "ft", inches: "in", centimeters: "cm", meters: "m", millimeters: "mm" };
      fd.append('unit', unitMap[dimensionUnit] || "m");
      fd.append('tier', userTier);
      if (activeWatermark) {
        fd.append('force_watermark', 'true');
        fd.append('watermark_text', watermarkText);
      }
      const apiRes = await axios.post("/api/resize", fd, { timeout: 120000, validateStatus: (status) => status < 500 });
      if (apiRes.status === 403) {
        triggerUpgrade(apiRes.data.error || "Daily limit reached.");
        toast.dismiss("res");
        setIsResizing(false);
        return;
      }
      if (apiRes.data.success) {
        console.log("[Studio] Resize Success:", apiRes.data.glb_url);
        // V176: Add cache-busting timestamp and increment version to force component reboot
        const freshUrl = `${apiRes.data.glb_url}${apiRes.data.glb_url.includes('?') ? '&' : '?'}v=${Date.now()}`;
        const proxiedUrl = toProxied(freshUrl);
        setLocalGlbUrl(proxiedUrl);
        setGlbFile(proxiedUrl);
        setGlbFileKey(apiRes.data.file_key);
        setPreviewVersion(v => v + 1);
        (window as any)._lastAppliedDims = currentDims;
        const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
        setDimensionInputs({ length: fmt(l), width: fmt(w), height: fmt(h) });
        setDimensions(liveDimensions);
        setScaleValue("");
        if (apiRes.data.usage) setUsageStats(apiRes.data.usage);
        toast.success("Done!", { id: "res" });
        saveSettings({ glbFile: proxiedUrl, glbFileKey: apiRes.data.file_key, dimensions: liveDimensions, dimensionUnit, scaleValue: "" });
      }
    } catch (e: any) {
      if (e.response?.status === 403) triggerUpgrade(e.response.data.error);
      else toast.error("Resize failed.", { id: "res" });
    } finally { setIsResizing(false); }
  };

  const handleReset = () => {
    if (!originalGlbUrl) return;
    setGlbFile(originalGlbUrl.split('?')[0]);
    setGlbFileKey(originalGlbKey);
    setGlbFileName(originalGlbFileName);
    if (originalDimensions) {
      const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };
      const factor = 1000 / (toMm[dimensionUnit] || 1000);
      setDimensionInputs({
        length: (originalDimensions.length * factor).toFixed(2),
        width: (originalDimensions.width * factor).toFixed(2),
        height: (originalDimensions.height * factor).toFixed(2)
      });
    }
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
      fd.append("tier", userTier);
      fd.append("watermark", forceWatermark ? "true" : "false");
      const isServerUrl = (u: string | null) => !!u && (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"));
      const glbUrlToSend = isServerUrl(localGlbUrl) ? localGlbUrl : glbFile;
      if (glbUrlToSend) fd.append("glb_url", glbUrlToSend);
      const res = await axios.post("/api/convert-usdz", fd, { validateStatus: (status) => status < 500 });
      if (res.status === 403) {
        triggerUpgrade(res.data.error || "Limit reached.");
        toast.dismiss("usdz");
        setIsConvertingUSDZ(false);
        return;
      }
      if (!res.data || !res.data.success) throw new Error(res.data?.error || "Backend failure");
      const downloadUrl = res.data.file_url || res.data.url;
      setConvertedUsdzUrl(downloadUrl);
      if (res.data.usage) setUsageStats(res.data.usage);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = res.data.filename || "model.usdz";
      a.click();
      toast.success("Converted!", { id: "usdz" });
    } catch (e: any) {
      toast.error("Failed.", { id: "usdz" });
    } finally { setIsConvertingUSDZ(false); }
  };

  const handleDetected = useCallback((d: { length: number; width: number; height: number }) => {
    const isCurrentlyZero = parseFloat(dimensions.length) === 0 && parseFloat(dimensions.width) === 0 && parseFloat(dimensions.height) === 0;
    if (d.length === 0 && d.width === 0 && d.height === 0 && !isCurrentlyZero) return;
    let rawL = d.length; let rawW = d.width; let rawH = d.height;
    setRawModelDimensions({ length: rawL, width: rawW, height: rawH });
    setOriginalDimensions({ length: rawL, width: rawW, height: rawH });
    setOriginalDimensionUnit("meters");
  }, [dimensions]);

  useEffect(() => {
    if (rawModelDimensions && !dimensionInputs.length && !dimensionInputs.width && !dimensionInputs.height) {
      const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };
      const factor = 1000 / (toMm[dimensionUnit] || 1000);
      const unitSuffix = unitLabel[dimensionUnit] || "ft";
      const l = (rawModelDimensions.length * factor).toFixed(2);
      const w = (rawModelDimensions.width * factor).toFixed(2);
      const h = (rawModelDimensions.height * factor).toFixed(2);
      setDimensionInputs({ length: l, width: w, height: h });
      setDimensions({ length: `${l}${unitSuffix}`, width: `${w}${unitSuffix}`, height: `${h}${unitSuffix}` });
    }
  }, [rawModelDimensions, dimensionUnit, dimensionInputs.length]);


  if (!glbFile || hasLoadError) {
    return (
      <div className="w-full">
        {hasLoadError && (
          <div className="max-w-4xl mx-auto mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
             <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
               <CubeTransparentIcon className="w-6 h-6" />
             </div>
             <div>
               <p className="text-sm font-bold text-red-900">Broken Model Detected</p>
               <p className="text-xs text-red-600">Your previous model couldn't be loaded. Resetting to upload page...</p>
             </div>
          </div>
        )}
        <HeroSection 
          glbFile={glbFile} 
          glbFileName={glbFileName} 
          handleGLBUpload={handleGLBUpload} 
          userTier={userTier} 
          isOverUploadLimit={!isSuperAdmin && usageStats && usageStats.uploads >= usageStats.maxUploads}
        />
        <FaqSection />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-[2rem] p-4 sm:p-6 animate-in zoom-in-95 duration-500">
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full px-4">
        <div className="flex-1 flex flex-col min-h-[500px] lg:min-h-[500px] relative">
          <div className="flex-1 relative flex flex-col">
            <ModelPreview3D 
              key={`${glbFileKey || "no-model"}-${previewVersion}`}
              glbUrl={localGlbUrl || toProxied(glbFile)!} 
              dimensions={liveDimensions} 
              onModelDimensionsDetected={handleDetected} 
              onReset={clearBrokenModel}
              onError={handleViewerError}
              isOptimizing={isResizing}
              userTier={userTier}
              isAdmin={isSuperAdmin}
            />
          </div>
          <div className="absolute -right-5 top-1/2 -translate-y-1/2 z-[3000]">
            <ManualUpload 
              onGLBUpload={handleGLBUpload} 
              currentGlbUrl={glbFile} 
              glbFileName={glbFileName} 
              variant="replacer" 
              userTier={userTier} 
              isOverUploadLimit={!isSuperAdmin && usageStats && usageStats.uploads >= usageStats.maxUploads}
            />
          </div>
          {isResizing && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[6px] z-50 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full animate-pulse"></div>
                </div>
              </div>
              <div className="mt-4 flex flex-col items-center animate-bounce">
                <p className="text-sm font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent uppercase tracking-[0.2em]">Optimizing Model</p>
              </div>
            </div>
          )}
        </div>

        <EditorControls 
          dimensionUnit={dimensionUnit}
          handleUnitChange={handleUnitChange}
          resizeMode={resizeMode}
          setResizeMode={setResizeMode}
          scaleValue={scaleValue}
          setScaleValue={setScaleValue}
          incrementScale={incrementScale}
          decrementScale={decrementScale}
          dimensionInputs={dimensionInputs}
          setDimensionInputs={setDimensionInputs}
          unitLabel={unitLabel}
          userTier={userTier}
          isSuperAdmin={isSuperAdmin}
          usageStats={usageStats}
          isResizing={isResizing}
          glbFileKey={glbFileKey}
          originalDimensions={originalDimensions}
          originalDimensionUnit={originalDimensionUnit}
          rawModelDimensions={rawModelDimensions}
          glbFile={glbFile}
          handleApply={handleApply}
          handleReset={handleReset}
          handleDownload={handleDownload}
          handleConvert={handleConvert}
          toProxied={toProxied}
          triggerUpgrade={triggerUpgrade}
          forceWatermark={forceWatermark}
          setForceWatermark={setForceWatermark}
          watermarkText={watermarkText}
          setWatermarkText={setWatermarkText}
        />
      </div>

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl relative">
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 font-bold text-xl">&times;</button>
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 text-white">
              <CubeTransparentIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-center text-gray-900 mb-2">{userTier === "NON_LOGGED" ? "Daily Limit Reached" : "Pro Limit Reached"}</h3>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-6">
              <p className="text-red-700 text-center text-[11px] font-bold leading-tight">⚠️ {upgradeMessage}</p>
            </div>
            <div className="space-y-4 mb-8">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600"><CheckCircleIcon className="w-5 h-5" /></div>
                  <div><p className="text-xs font-black text-gray-900">250 Monthly Rescales</p></div>
               </div>
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600"><CheckCircleIcon className="w-5 h-5" /></div>
                  <div><p className="text-xs font-black text-gray-900">Unlimited USDZ & AR</p></div>
               </div>
            </div>
            <div className="flex flex-col gap-3">
              {userTier === "NON_LOGGED" ? (
                <button onClick={() => { setShowUpgradeModal(false); router.push('/signup'); }} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg">Sign Up to Continue</button>
              ) : (
                <button onClick={() => { setShowUpgradeModal(false); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg">Upgrade to Pro</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Emergency Recovery Button - Only visible when stuck */}
      {glbFile && (
        <button 
          onClick={clearBrokenModel}
          className="fixed bottom-4 left-4 z-[4000] px-3 py-1.5 bg-gray-900/50 hover:bg-gray-900 text-white text-[10px] font-bold rounded-lg backdrop-blur-sm transition-all flex items-center gap-2 opacity-50 hover:opacity-100"
        >
          <ArrowPathIcon className="w-3 h-3" />
          Reset Editor
        </button>
      )}
    </div>
  );
}
