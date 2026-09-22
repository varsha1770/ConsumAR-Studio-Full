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
import { getGuestMac } from "@/lib/guest";

const toProxied = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') return null;
  // Rule: If it starts with "/", it's a local file. NO PROXY NEEDED.
  if (url.startsWith('/')) {
    return url;
  }
  
  // V20: Apple AR Quick Look URL Fix + CORS Bypass (Base64 path encoding with chunking)
  // We must proxy ALL S3 URLs through Next.js because the glb-output bucket lacks frontend CORS headers.
  const isUsdz = url.toLowerCase().includes('.usdz');
  const ext = isUsdz ? '.usdz' : '.glb';
  const encodedUrl = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const chunks = encodedUrl.match(/.{1,200}/g)?.join('/') || encodedUrl;
  return `/api/proxy-model/${chunks}/file${ext}`;
};

const unitLabel: Record<string, string> = { millimeters: "mm", centimeters: "cm", inches: "in", feet: "ft", meters: "m" };

export default function UploadSection() {
  const { data: session } = useSession();
  const router = useRouter();

  const [glbFile, setGlbFile] = useState<string | null>(null);
  const [glbFileKey, setGlbFileKey] = useState<string | null>(null);
  const [glbFileName, setGlbFileName] = useState<string | null>(null);

  const [localGlbUrl, setLocalGlbUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ length: "0cm", width: "0cm", height: "0cm" });
  const [dimensionUnit, setDimensionUnit] = useState("centimeters");
  const [dimensionInputs, setDimensionInputs] = useState({ length: "", width: "", height: "" });
  const [rawModelDimensions, setRawModelDimensions] = useState<{ length: number, width: number, height: number } | null>(null);
  const [scaleValue, setScaleValue] = useState("");
  const [resizeMode, setResizeMode] = useState<"manual" | "scale">("manual");
  const [isResizing, setIsResizing] = useState(false);
  const [originalDimensions, setOriginalDimensions] = useState<any>(null);
  const [lastAppliedDimensions, setLastAppliedDimensions] = useState<any>(null);
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
  const [forceWatermark, setForceWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState("TryitFirstLabs");
  const [hasLoadError, setHasLoadError] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const isSampleModel = !!originalGlbUrl && originalGlbUrl.startsWith('/') && !originalGlbUrl.startsWith('/api');

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

  const fetchLimits = useCallback(async (forSample = false) => {
    try {
      const endpoint = forSample ? "/api/sample-upload" : "/api/user/limits";
      const res = await axios.get(endpoint, {
        params: { mac: getGuestMac() },
        headers: { "x-guest-mac": getGuestMac() },
        validateStatus: (status) => status < 500
      });
      if (res.data?.success) {
        if (!forSample && res.data.tier) setUserTier(res.data.tier);
        if (res.data.usage) setUsageStats(res.data.usage);
        if (!forSample && res.data.tier === "NON_LOGGED") {
          setDimensionUnit("centimeters");
        }
      }
    } catch (err) {
      // Graceful quiet catch for network re-connects
    }
  }, []);

  // Fetch Limits on mount, session change, or when switching between sample/normal models
  useEffect(() => {
    fetchLimits(isSampleModel);
  }, [session, isSampleModel, fetchLimits]);

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

  // Auto-convert USDZ on initial mount if a model exists but has no convertedUsdzUrl yet
  const hasTriggeredMountUsdz = useRef(false);
  useEffect(() => {
    if (!convertedUsdzUrl && !hasTriggeredMountUsdz.current) {
      const urlToUse = glbFile || localGlbUrl || originalGlbUrl || '/sample2.glb';
      const keyToUse = glbFileKey || originalGlbKey || 'sample2.glb';
      hasTriggeredMountUsdz.current = true;
      autoConvertUSDZ(urlToUse, keyToUse);
    }
  }, [glbFile, glbFileKey, convertedUsdzUrl, localGlbUrl, originalGlbUrl, originalGlbKey]);

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

  const handleGLBUpload = async (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => {
    const isSample = fileUrl.startsWith('/') && !fileUrl.startsWith('/api');
    if (isSample) {
      try {
        const res = await axios.post('/api/sample-upload', {}, { headers: { "x-guest-mac": getGuestMac() } });
        if (!res.data.success) {
           toast.error(res.data.error || "Sample upload limit reached");
           return;
        } else if (res.data.usage) {
           setUsageStats(res.data.usage);
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
           toast.error(err.response.data.error || "Sample upload limit reached");
        } else {
           toast.error("Failed to load sample model.");
        }
        return;
      }
    }

    console.log("[Studio] New Upload:", { fileUrl, fileKey, fileName, hasBlob: !!fileBlobUrl });
    const cleanUrl = fileUrl; // V178: Do NOT strip the AWS signature!
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
    setLastAppliedDimensions(null);
    setRawModelDimensions(null);
    setDimensionInputs({ length: "", width: "", height: "" });
    const unitSuffix = unitLabel[dimensionUnit] || "ft";
    const initialDims = { length: `0${unitSuffix}`, width: `0${unitSuffix}`, height: `0${unitSuffix}` };
    setDimensions(initialDims);
    setScaleValue("");
    let initialUsdz: string | null = null;
    if ((cleanUrl && cleanUrl.includes("sample1")) || (fileKey && fileKey.includes("sample-model-1"))) initialUsdz = "/sample1.usdz";
    else if ((cleanUrl && cleanUrl.includes("sample2")) || (fileKey && fileKey.includes("sample-model-2"))) initialUsdz = "/sample2.usdz";
    else if ((cleanUrl && cleanUrl.includes("sample3")) || (fileKey && fileKey.includes("sample-model-3"))) initialUsdz = "/sample3.usdz";

    setConvertedUsdzUrl(initialUsdz);
    saveSettings({ glbFile: cleanUrl, glbFileKey: fileKey, glbFileName: fileName, dimensions: initialDims, scaleValue: "" });

    // Trigger auto conversion in background
    if (fileKey && cleanUrl) {
      autoConvertUSDZ(cleanUrl, fileKey);
    }
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

    if (resizeMode === "scale") {
      const s = parseFloat(scaleValue) || 1.0;
      const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };

      const baseDims = lastAppliedDimensions || originalDimensions;
      const origL = parseFloat(baseDims?.length) || 0;
      const origW = parseFloat(baseDims?.width) || 0;
      const origH = parseFloat(baseDims?.height) || 0;

      // V176: Robust Unit Handling. Use originalDimensionUnit if available.
      let actualOrigUnit = originalDimensionUnit || "meters";
      if (actualOrigUnit === "meters" && (origL > 10.0 || origW > 10.0 || origH > 10.0)) {
        actualOrigUnit = "centimeters";
      }

      const valInMm = origL * (toMm[actualOrigUnit] || 1000);
      const targetFactor = 1 / (toMm[dimensionUnit] || 1000);
      const rawVal = valInMm * targetFactor;

      l = rawVal * s;

      const valWInMm = origW * (toMm[actualOrigUnit] || 1000);
      const rawValW = valWInMm * targetFactor;
      w = rawValW * s;

      const valHInMm = origH * (toMm[actualOrigUnit] || 1000);
      const rawValH = valHInMm * targetFactor;
      h = rawValH * s;
    }

    const formatValue = (val: number) => {
      return val.toFixed(3);
    };

    return {
      length: `${formatValue(l)}${unitSuffix}`,
      width: `${formatValue(w)}${unitSuffix}`,
      height: `${formatValue(h)}${unitSuffix}`
    };
  }, [resizeMode, scaleValue, dimensionInputs, dimensionUnit, originalDimensions]);

  // V176: PERFORMANCE DEBOUNCE - Wait 300ms after typing before updating 3D viewer
  const [debouncedDimensions, setDebouncedDimensions] = useState(liveDimensions);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDimensions(liveDimensions);
    }, 300);
    return () => clearTimeout(timer);
  }, [liveDimensions]);

  const handleApply = async (forceWatermarkOverride?: boolean, isDownload: boolean = false, isRemoval: boolean = false): Promise<string | null> => {
    if (!glbFileKey) return null;
    const l = parseFloat(liveDimensions.length);
    const w = parseFloat(liveDimensions.width);
    const h = parseFloat(liveDimensions.height);
    if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0) {
      toast.error("Please enter valid dimensions.");
      return null;
    }
    if (!originalDimensions) setOriginalDimensions({ ...dimensionInputs });
    setIsResizing(true);
    try {
      const activeWatermark = forceWatermarkOverride !== undefined ? forceWatermarkOverride : forceWatermark;
      const currentDims = JSON.stringify({ l, w, h, unit: dimensionUnit, watermark: activeWatermark, text: watermarkText, isDownload, isRemoval });

      if (!isDownload && !isRemoval && (window as any)._lastAppliedDims === currentDims) {
        toast.success("Design already applied!", { id: "res" });
        setIsResizing(false);
        return null;
      }
      toast.dismiss(); // Clear previous notifications
      toast.loading(isRemoval ? "Stripping Watermark..." : isDownload ? "Finalizing for download..." : "Optimizing & Baking Design...", { id: "res" });
      const fUrl = toProxied(originalGlbUrl) || toProxied(glbFile)!;
      const fRes = await fetch(fUrl);
      const fBlob = await fRes.blob();
      const fd = new FormData();
      fd.append('file', fBlob, glbFileName || "model.glb");
      fd.append('width', l.toString());
      fd.append('height', h.toString());
      fd.append('depth', w.toString());
      fd.append('mode', resizeMode === 'scale' ? 'uniform' : 'non-uniform');
      fd.append('is_sample_model', (typeof isSampleModel !== 'undefined' ? isSampleModel : false).toString());
      const unitMap: Record<string, string> = { feet: "ft", inches: "in", centimeters: "cm", meters: "m", millimeters: "mm" };
      fd.append('unit', unitMap[dimensionUnit] || "m");
      fd.append('tier', userTier);
      fd.append('is_download', isDownload ? "true" : "false");
      fd.append('remove_watermark', isRemoval ? "true" : "false");
      if (activeWatermark) {
        fd.append('force_watermark', 'true');
        fd.append('watermark_text', watermarkText);
      }
      const apiRes = await axios.post("/api/resize", fd, {
        timeout: 120000,
        validateStatus: (status) => status < 500,
        headers: { "x-guest-mac": getGuestMac() }
      });
      if (apiRes.status === 403) {
        triggerUpgrade(apiRes.data.error || "Daily limit reached.");
        toast.dismiss("res");
        setIsResizing(false);
        return null;
      }
      if (apiRes.data.success) {
        const resultGlbUrl = apiRes.data.glb_url || apiRes.data.file_url || apiRes.data.url;
        console.log("[Studio] Resize Success:", resultGlbUrl);
        // V177: Do NOT append ?v=timestamp to AWS Presigned URLs because it invalidates the signature!
        const proxiedUrl = toProxied(resultGlbUrl);
        setLocalGlbUrl(proxiedUrl);
        setGlbFile(proxiedUrl);
        setGlbFileKey(apiRes.data.file_key);
        setDimensions({ ...liveDimensions });
        setDebouncedDimensions({ ...liveDimensions }); // IMMEDIATE SYNC after resize
        setPreviewVersion(v => v + 1);
        (window as any)._lastAppliedDims = currentDims;
        const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
        setDimensionInputs({ length: fmt(l), width: fmt(w), height: fmt(h) });
        setLastAppliedDimensions({ length: l, width: w, height: h });
        setOriginalDimensionUnit(dimensionUnit);
        setScaleValue("");
        if (apiRes.data.usage) setUsageStats(apiRes.data.usage);
        toast.success("Done!", { id: "res" });
        saveSettings({ glbFile: proxiedUrl, glbFileKey: apiRes.data.file_key, dimensions: liveDimensions, dimensionUnit, scaleValue: "" });
        
        // Trigger auto conversion for the resized model
        autoConvertUSDZ(resultGlbUrl, apiRes.data.file_key);
        
        return proxiedUrl;
      }
      return null;
    } catch (e: any) {
      if (e.response?.status === 403) triggerUpgrade(e.response.data.error);
      else toast.error("Resize failed.", { id: "res" });
      return null;
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
    setLastAppliedDimensions(null);
    setOriginalDimensionUnit("meters");
    setScaleValue("");
    setConvertedUsdzUrl(null);
    toast.success("Reset Complete!");
  };

  const handleDownload = async (url: string, fileName: string, draco = false) => {
    const toastId = "download-process";
    try {
      const isPaid = userTier === "PAID" || isSuperAdmin;
      let finalUrl = url;

      if (!isPaid) {
        toast.loading("Baking Protection...", { id: toastId });
        const brandedUrl = await handleApply(true, true);
        if (!brandedUrl) {
          toast.error("Download preparation failed.", { id: toastId });
          return;
        }
        finalUrl = brandedUrl;
      } else {
        finalUrl = glbFile || url;
      }

      toast.loading("Fetching model...", { id: toastId });
      const r = await fetch(finalUrl);
      let b = await r.blob();

      if (draco) {
        toast.loading("Optimizing GLB...", { id: toastId });
        const { compressGLB } = await import('../utils/glbCompressor');
        b = await compressGLB(new File([b], fileName));
      }

      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(b);
      a.download = fileName;
      a.click();
      toast.success("Ready! ✅", { id: toastId });
    } catch (e) {
      toast.error("Failed to download.", { id: toastId });
    }
  };

  const autoConvertUSDZ = async (glbUrlToUse?: string | null, s3Key?: string | null) => {
    if (!glbUrlToUse || !s3Key) return;
    try {
      const urlStr = String(glbUrlToUse);
      const keyStr = String(s3Key);

      if (urlStr.includes("sample1") || keyStr.includes("sample-model-1")) {
        setConvertedUsdzUrl("/sample1.usdz");
        return;
      }
      if (urlStr.includes("sample2") || keyStr.includes("sample-model-2")) {
        setConvertedUsdzUrl("/sample2.usdz");
        return;
      }
      if (urlStr.includes("sample3") || keyStr.includes("sample-model-3")) {
        setConvertedUsdzUrl("/sample3.usdz");
        return;
      }

      const fdUsdz = new FormData();
      fdUsdz.append("s3_key", s3Key);
      fdUsdz.append("tier", userTier);
      fdUsdz.append("is_download", "false"); 
      fdUsdz.append("watermark", "true");
      fdUsdz.append("watermark_text", watermarkText);
      
      const isServerUrl = (u: string | null) => !!u && (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"));
      let glbUrlToSend = isServerUrl(glbUrlToUse) ? glbUrlToUse : glbUrlToUse;
      if (glbUrlToSend && glbUrlToSend.startsWith('/')) {
        glbUrlToSend = window.location.origin + glbUrlToSend;
      }
      fdUsdz.append("glb_url", glbUrlToSend);
      fdUsdz.append("is_sample_model", (typeof isSampleModel !== 'undefined' ? isSampleModel : false).toString());
      
      const usdzRes = await axios.post("/api/convert-usdz", fdUsdz, {
        validateStatus: (status) => status < 600,
        headers: { "x-guest-mac": getGuestMac() }
      });

      if (usdzRes.status === 403) {
        triggerUpgrade(usdzRes.data.error || "Daily USDZ conversion limit reached.");
        return;
      }

      if (usdzRes.status === 200 && usdzRes.data?.success) {
         const usdzUrl = usdzRes.data.usdz_url || usdzRes.data.file_url || usdzRes.data.url;
         setConvertedUsdzUrl(usdzUrl);
      }
    } catch (e) {
      console.error("Auto USDZ Conversion Failed:", e);
    }
  };

  const handleConvert = async (isOriginal: boolean = false) => {
    if (isConvertingUSDZ || (!glbFileKey && !isOriginal)) return;
    const toastId = "usdz-process";
    setIsConvertingUSDZ(true);
    try {
      toast.loading("Starting conversion...", { id: toastId });
      const fd = new FormData();
      fd.append("s3_key", isOriginal ? (originalGlbKey || "") : (glbFileKey || ""));
      fd.append("tier", userTier);
      fd.append("is_download", "true");
      fd.append("watermark", "true");
      fd.append("watermark_text", watermarkText);
      fd.append('is_sample_model', (typeof isSampleModel !== 'undefined' ? isSampleModel : false).toString());

      const isServerUrl = (u: string | null) => !!u && (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"));
      let glbUrlToSend = isServerUrl(localGlbUrl) ? localGlbUrl : glbFile;
      if (glbUrlToSend && glbUrlToSend.startsWith('/')) {
        glbUrlToSend = window.location.origin + glbUrlToSend;
      }
      if (glbUrlToSend) fd.append("glb_url", glbUrlToSend);

      toast.loading("Processing USDZ... This may take a minute.", { id: toastId });
      const res = await axios.post("/api/convert-usdz", fd, {
        validateStatus: (status) => status < 600,
        headers: { "x-guest-mac": getGuestMac() }
      });

      if (res.status === 403) {
        triggerUpgrade(res.data.error || "Limit reached.");
        toast.dismiss(toastId);
        setIsConvertingUSDZ(false);
        return;
      }

      if (!res.data || !res.data.success) throw new Error(res.data?.error || "Backend failure");

      const downloadUrl = res.data.usdz_url || res.data.file_url || res.data.url;
      setConvertedUsdzUrl(downloadUrl);
      if (res.data.usage) setUsageStats(res.data.usage);

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = res.data.filename || "model.usdz";
      a.click();
      toast.success("Converted successfully! ✅", { id: toastId });
    } catch (e: any) {
      toast.error("Conversion failed. Please try again.", { id: toastId });
    } finally { setIsConvertingUSDZ(false); }
  };

  const handleDetected = useCallback((d: { length: number; width: number; height: number }) => {
    if (isNaN(d.length) || isNaN(d.width) || isNaN(d.height)) return;

    setRawModelDimensions((prev: { length: number; width: number; height: number } | null) => {
      if (prev && Math.abs(prev.length - d.length) < 0.001 && Math.abs(prev.height - d.height) < 0.001) return prev;
      return { length: d.length, width: d.width, height: d.height };
    });

    setOriginalDimensions((prev: any) => {
      if (prev) return prev;
      setOriginalDimensionUnit("meters"); // ONLY set unit to meters if we are detecting for the first time
      return { length: d.length, width: d.width, height: d.height };
    });
    setLastAppliedDimensions((prev: any) => {
      if (prev) return prev;
      return { length: d.length, width: d.width, height: d.height };
    });
  }, []); // Empty dependency array to stay stable

  const handleRemoveWatermark = () => {
    if (userTier !== "PAID" && !isSuperAdmin) {
      triggerUpgrade("Watermark removal is a Premium feature!");
      return;
    }
    handleApply(false, true); // forceWatermark=false, isRemoval=true
  };

  useEffect(() => {
    if (rawModelDimensions) {
      const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };
      const unitSuffix = unitLabel[dimensionUnit] || "ft";

      // V176: Smart Factor. Use 10.0 threshold to match EditorControls
      const isHuge = (rawModelDimensions.length > 10.0 || rawModelDimensions.width > 10.0 || rawModelDimensions.height > 10.0);
      const normalizer = isHuge ? 0.01 : 1.0;
      const unitFactor = 1000 / (toMm[dimensionUnit] || 1000);

      const formatValue = (val: number): string => {
        if (isNaN(val)) return "0.000";
        return val.toFixed(3);
      };

      const l = formatValue(rawModelDimensions.length * normalizer * unitFactor);
      const w = formatValue(rawModelDimensions.width * normalizer * unitFactor);
      const h = formatValue(rawModelDimensions.height * normalizer * unitFactor);

      // V145: Force update sidebar to match real model dimensions
      setDimensionInputs({ length: l, width: w, height: h });
      setDimensions({ length: `${l}${unitSuffix}`, width: `${w}${unitSuffix}`, height: `${h}${unitSuffix}` });
    }
  }, [rawModelDimensions, dimensionUnit]);


  if (!glbFile || hasLoadError) {
    return (
      <div className="w-full flex flex-col">
        {hasLoadError && (
          /* Added responsive horizontal padding so the banner doesn't touch the screen edges on mobile */
          <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
            <div className="max-w-4xl mx-auto mb-2 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-100 rounded-xl sm:rounded-2xl flex flex-row items-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-4 shadow-sm">

              {/* Added shrink-0 so the icon never gets squished by long text on small screens */}
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <CubeTransparentIcon className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>

              <div className="flex flex-col">
                <p className="text-xs sm:text-sm font-bold text-red-900 leading-tight">
                  Broken Model Detected
                </p>
                <p className="text-[10px] sm:text-xs text-red-600 mt-0.5 sm:mt-1 leading-snug">
                  Your previous model couldn't be loaded. Resetting to upload page...
                </p>
              </div>

            </div>
          </div>
        )}

        <HeroSection
          glbFile={glbFile}
          glbFileName={glbFileName}
          handleGLBUpload={handleGLBUpload}
          userTier={userTier}
          isOverUploadLimit={!isSuperAdmin && usageStats && usageStats.uploads >= usageStats.maxUploads}
          setGlbFile={setGlbFile}
        />
        <FaqSection />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 w-full animate-in zoom-in-95 duration-500 overflow-visible mb-20 md:mb-0">

      {/* Top action bar */}
      <div className="w-full flex justify-between items-center mb-4 px-1 sm:px-4">
        <button
          onClick={clearBrokenModel}
          className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl font-semibold text-sm transition-all shadow-sm active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Uploads
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-8 items-start w-full px-1 sm:px-4">

        {/* LEFT SIDE: 3D Viewer Container */}
        {/* FIX 1: Removed flex-1 from the wrapper so it doesn't arbitrarily collapse on mobile */}
        <div className="w-full lg:flex-1 flex flex-col relative shrink-0">

          {/* FIX 2: Applied strict h-[...] instead of min-h to physically force the box open on all devices */}
          <div className="relative w-full h-[350px] sm:h-[450px] lg:h-[500px] rounded-xl overflow-hidden shadow-inner bg-gray-50/50 border border-gray-100">
            <ModelPreview3D
              key={`${glbFileKey || "no-model"}-${previewVersion}`}
              glbUrl={localGlbUrl || toProxied(glbFile)!}
              publicGlbUrl={toProxied(glbFile) || undefined}
              usdzUrl={convertedUsdzUrl}
              dimensions={debouncedDimensions}
              currentUnit={dimensionUnit}
              onModelDimensionsDetected={handleDetected}
              onReset={clearBrokenModel}
              onError={handleViewerError}
              isOptimizing={isResizing}
              userTier={userTier}
              isAdmin={isSuperAdmin}
            />

            {/* Loading Overlay - Moved inside the strict height box so it perfectly covers the viewer */}
            {isResizing && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[2500] flex flex-col items-center justify-center transition-all">
                <div className="relative">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-200 border-t-purple-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="mt-3 sm:mt-4 flex flex-col items-center animate-bounce">
                  <p className="text-xs sm:text-sm font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent uppercase tracking-[0.2em] text-center px-4">
                    Optimizing Model
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Floating Replacer Button */}
          {/* Snapped to the bottom-right of the 3D viewer box so it doesn't float randomly off-screen */}
          <div className="absolute -bottom-4 right-2 sm:-bottom-5 sm:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:-right-6 z-[3000]">
            <ManualUpload
              onGLBUpload={handleGLBUpload}
              currentGlbUrl={glbFile}
              glbFileName={glbFileName}
              variant="replacer"
              userTier={userTier}
              isOverUploadLimit={!isSuperAdmin && usageStats && usageStats.uploads >= usageStats.maxUploads}
            />
          </div>
        </div>

        {/* RIGHT SIDE: Editor Controls */}
        {/* FIX 3: Added pb-24 on mobile so the bottom buttons aren't hidden behind the sticky navbar */}
        <div className="w-full lg:w-[350px] xl:w-[380px] shrink-0 mt-6 sm:mt-8 lg:mt-0 pb-24 md:pb-0">
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
            originalDimensions={lastAppliedDimensions || originalDimensions}
            originalDimensionUnit={originalDimensionUnit}
            rawModelDimensions={rawModelDimensions}
            glbFile={glbFile}
            originalGlbKey={originalGlbKey}
            handleConvertOriginal={() => handleConvert(true)}
            handleConvert={handleConvert}
            handleApply={handleApply}
            handleReset={handleReset}
            handleDownload={handleDownload}
            handleRemoveWatermark={handleRemoveWatermark}
            toProxied={toProxied}
            triggerUpgrade={triggerUpgrade}
            forceWatermark={forceWatermark}
            setForceWatermark={setForceWatermark}
            watermarkText={watermarkText}
            setWatermarkText={setWatermarkText}
            isSampleModel={isSampleModel}
            convertedUsdzUrl={convertedUsdzUrl}
          />
        </div>
      </div>

      {/* UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 sm:top-5 right-4 sm:right-5 p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
            >
              <span className="text-2xl font-bold leading-none">&times;</span>
            </button>

            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[1.5rem] bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 sm:mb-5 text-white shadow-lg shadow-purple-500/30">
              <CubeTransparentIcon className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-center text-gray-900 mb-2 sm:mb-3">
              {userTier === "NON_LOGGED" ? "Daily Limit Reached" : "Pro Limit Reached"}
            </h3>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-5 sm:mb-6">
              <p className="text-red-700 text-center text-[10px] sm:text-[11px] font-bold leading-relaxed px-2">
                ⚠️ {upgradeMessage}
              </p>
            </div>

            <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 px-2 sm:px-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                  <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div><p className="text-xs sm:text-sm font-black text-gray-900">250 Monthly Rescales</p></div>
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div><p className="text-xs sm:text-sm font-black text-gray-900">Unlimited USDZ & AR</p></div>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              {userTier === "NON_LOGGED" ? (
                <button
                  onClick={() => { setShowUpgradeModal(false); router.push('/login'); }}
                  className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm sm:text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
                >
                  Sign In / Sign Up
                </button>
              ) : (
                <button
                  onClick={() => { setShowUpgradeModal(false); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm sm:text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
