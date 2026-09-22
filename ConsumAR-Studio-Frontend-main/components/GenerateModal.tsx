import { Fragment, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, Transition } from "@headlessui/react";
import {
  SparklesIcon,
  XMarkIcon,
  PhotoIcon,
  ArrowPathIcon,
  PencilIcon,
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/solid";
import Lottie from "lottie-react";
import LoaderAnimation from "../animations/Loader.json";
import ModelPreview3D from "./ModelPreview3D";
import toast from "react-hot-toast";
import axios from "axios";
import { getGuestMac } from "../lib/guest";
import { QRCodeSVG } from 'qrcode.react';

/** Proxy S3/EC2 URLs through Next.js to avoid browser CORS blocks */
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

interface GenerateModalProps {
  onClose: () => void;
}

interface UploadedImage {
  url: string;
  name: string;
  file: File;
}

const generationStages = [
  "Initializing processing pipeline...",
  "Building the geometry...",
  "Optimizing mesh structure...",
  "Baking textures and final details...",
];

export default function GenerateModal({ onClose }: GenerateModalProps) {
  const [uploadedImages, setUploadedImages] = useState<(UploadedImage | null)[]>(
    Array(8).fill(null)
  );
  const [limitModalType, setLimitModalType] = useState<"GUEST" | "PAID" | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [limits, setLimits] = useState<any>(null);
  const [showEditProportions, setShowEditProportions] = useState(false);
  const [generatedGlbUrl, setGeneratedGlbUrl] = useState<string | null>(null);
  const [generatedUsdzUrl, setGeneratedUsdzUrl] = useState<string | null>(null);
  const [generatedS3Key, setGeneratedS3Key] = useState("");
  const [generatedShortId, setGeneratedShortId] = useState("");
  const [isConvertingUSDZ, setIsConvertingUSDZ] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dimensions, setDimensions] = useState({ length: "0ft", width: "0ft", height: "0ft" });
  const [dimensionUnit, setDimensionUnit] = useState("feet");
  const [dimensionInputs, setDimensionInputs] = useState({ length: "", width: "", height: "" });
  const [scaleValue, setScaleValue] = useState("");
  const [resizeMode, setResizeMode] = useState<"manual" | "scale">("manual");
  const [originalDimensions, setOriginalDimensions] = useState<any>(null);
  const [originalDimensionUnit, setOriginalDimensionUnit] = useState<string | null>(null);
  const [originalGlbUrl, setOriginalGlbUrl] = useState<string | null>(null);
  const [originalS3Key, setOriginalS3Key] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState(0);
  const [userTier, setUserTier] = useState("NON_LOGGED");
  const generateAbortRef = useRef<AbortController | null>(null);
  
  // AR Compilation state
  const [arTargetImage, setArTargetImage] = useState<File | null>(null);
  const [isCompilingAR, setIsCompilingAR] = useState(false);
  const [arViewerUrl, setArViewerUrl] = useState<string | null>(null);

  const { data: session } = useSession();

  useEffect(() => {
    if (!generatedGlbUrl && !generatedUsdzUrl) return;
    fetch("/api/ar-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: generatedShortId,
        glbUrl: toProxied(generatedGlbUrl), 
        usdzUrl: toProxied(generatedUsdzUrl) 
      })
    })
      .then(res => res.json())
      .then(data => { if (data.id) setGeneratedShortId(data.id); })
      .catch(err => console.error("Failed to generate short AR link", err));
  }, [generatedGlbUrl, generatedUsdzUrl, generatedShortId]);

  const saveToLogbook = async (overrides = {}) => {
    if (!session) return;
    try {
      const current = {
        glbFile: generatedGlbUrl,
        glbFileKey: generatedS3Key,
        usdzFile: generatedUsdzUrl,
        dimensions,
        dimensionUnit,
        scaleValue,
        ...overrides
      };
      await axios.post("/api/user-settings", current);
    } catch (e) {
      console.error("The Butler failed to update the Logbook:", e);
    }
  };

  useEffect(() => {
    if (!isGenerating) {
      setGenerationStage(0);
      return;
    }

    const id = window.setInterval(() => {
      setGenerationStage((prev) => (prev + 1) % generationStages.length);
    }, 1800);

    return () => window.clearInterval(id);
  }, [isGenerating]);

  const fetchLimits = async () => {
    try {
      const res = await axios.get("/api/user/limits", { headers: { "x-guest-mac": getGuestMac() } });
      if (res.data.success) {
        setUserTier(res.data.tier);
        setLimits(res.data.usage);
      }
    } catch (err) {
      console.error("Failed to fetch limits in GenerateModal:", err);
    }
  };

  useEffect(() => {
    fetchLimits();
  }, [session]);

  // Dimension conversion helper
  const convertDimension = (value: string, fromUnit: string, toUnit: string): string => {
    if (!value || value === "") return "";
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return "";
    const toMm: Record<string, number> = {
      millimeters: 1,
      centimeters: 10,
      inches: 25.4,
      feet: 304.8,
      meters: 1000,
    };
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
    const unitMap: Record<string, string> = {
      millimeters: "mm",
      centimeters: "cm",
      inches: "in",
      feet: "ft",
      meters: "m",
    };
    const unit = unitMap[newUnit] || "m";

    setDimensionInputs(converted);
    setDimensions({
      length: `${converted.length || "0"}${unit}`,
      width: `${converted.width || "0"}${unit}`,
      height: `${converted.height || "0"}${unit}`,
    });
    setDimensionUnit(newUnit);
  };

  const handleModelDimensionsDetected = (detected: { length: number; height: number; width: number }) => {
    // Only update if dimensions are currently empty or "0"
    if (dimensionInputs.length === "" || dimensionInputs.length === "0") {
      const maxDim = Math.max(detected.length, detected.width, detected.height);
      const normalizer = maxDim > 10.0 ? (2.0 / (detected.length || 1.0)) : 1.0;

      const normL = detected.length * normalizer;
      const normW = detected.width * normalizer;
      const normH = detected.height * normalizer;

      const fmt = (m: number) => {
        const toMm: Record<string, number> = {
          millimeters: 1,
          centimeters: 10,
          inches: 25.4,
          feet: 304.8,
          meters: 1000,
        };
        const valInMm = m * 1000;
        const valInUnit = valInMm / (toMm[dimensionUnit] || 1000);
        return (Math.round(valInUnit * 100) / 100).toString();
      };

      const l = fmt(normL);
      const w = fmt(normW);
      const h = fmt(normH);

      const unitMap: Record<string, string> = {
        millimeters: "mm",
        centimeters: "cm",
        inches: "in",
        feet: "ft",
        meters: "m",
      };
      const unit = unitMap[dimensionUnit] || "m";

      setDimensionInputs({ length: l, width: w, height: h });
      setDimensions({
        length: `${l}${unit}`,
        width: `${w}${unit}`,
        height: `${h}${unit}`,
      });
    }
  };

  const handleApplyScale = () => {
    const s = parseFloat(scaleValue);
    if (isNaN(s) || s <= 0) {
      toast.error("Please enter a scale value greater than 0 (e.g., 2 to double, 0.5 to halve).", {
        duration: 3000,
      });
      return;
    }
  };

  const incrementScale = () => setScaleValue(((parseFloat(scaleValue) || 1) + 0.1).toFixed(1));
  const decrementScale = () => {
    const c = parseFloat(scaleValue) || 1;
    if (c > 0.1) setScaleValue((c - 0.1).toFixed(1));
  };

  const convertAvifToJpeg = async (file: File): Promise<File> => {
    const isAvif = file.name.toLowerCase().endsWith('.avif') || file.type.toLowerCase() === 'image/avif';
    if (!isAvif) return file;

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (blob) {
        const newName = file.name.replace(/\.avif$/i, '.jpg');
        return new File([blob], newName, { type: 'image/jpeg' });
      }
    } catch (err) {
      console.warn('Failed to convert AVIF to JPEG in browser, sending original file:', err);
    }
    return file;
  };

  const handleImageUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter((f) => {
      const type = f.type.toLowerCase();
      const ext = f.name.toLowerCase();
      return type.startsWith("image/") || ext.endsWith(".avif");
    });

    if (imageFiles.length === 0) {
      toast.error("Invalid file type. Please upload image files (JPG, PNG, WEBP, AVIF).", {
        duration: 3000,
      });
      return;
    }

    // Convert any AVIF files to high-quality JPEGs in browser to ensure 100% EC2 backend compatibility
    const convertedFiles = await Promise.all(imageFiles.map((f) => convertAvifToJpeg(f)));

    const MAX_SIZE = 30 * 1024 * 1024;
    const valid: File[] = [];
    let hasOversizedFiles = false;

    convertedFiles.forEach((file) => {
      if (file.size > MAX_SIZE) {
        hasOversizedFiles = true;
        toast.error(`${file.name} is too large (max 30MB). Please use a smaller image.`, {
          duration: 4000,
        });
      } else {
        valid.push(file);
      }
    });

    if (valid.length === 0) return;

    const newImages = [...uploadedImages];
    let cur = index;
    let addedCount = 0;

    for (let i = 0; i < valid.length && cur < 8; i++) {
      while (cur < 8 && newImages[cur]) cur++;
      if (cur < 8) {
        newImages[cur] = { url: URL.createObjectURL(valid[i]), name: valid[i].name, file: valid[i] };
        cur++;
        addedCount++;
      }
    }

    setUploadedImages(newImages);
    event.target.value = "";

    if (addedCount > 0) {
      toast.success(`${addedCount} image${addedCount > 1 ? "s" : ""} added successfully!`, {
        duration: 2000,
      });
    }

    if (valid.length > addedCount) {
      toast.error(
        `Maximum 8 images allowed. ${valid.length - addedCount} image${valid.length - addedCount > 1 ? "s" : ""
        } not added.`,
        {
          duration: 3000,
        }
      );
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages[index] = null;
    setUploadedImages(newImages);
  };

  const handleGenerate = async () => {
    if (limits && limits.generate3d >= limits.maxGenerate3d) {
      setLimitModalType(userTier === "NON_LOGGED" ? "GUEST" : "PAID");
      return;
    }

    const imagesToUpload = uploadedImages.filter(Boolean) as UploadedImage[];

    if (imagesToUpload.length === 0) {
      toast.error("Please upload at least one image to generate a 3D model.", {
        duration: 3000,
      });
      return;
    }

    setIsGenerating(true);

    try {
      const abortController = new AbortController();
      generateAbortRef.current = abortController;
      const formData = new FormData();
      for (const img of imagesToUpload) {
        formData.append("images", img.file);
      }

      const response = await axios.post("/api/generate-3d", formData, {
        headers: { "x-guest-mac": getGuestMac() },
        timeout: 120_000,
        signal: abortController.signal,
      });

      const { success, file_url, glb_url, s3_key, file_key, url, dimensions: backendDimensions } = response.data;
      const resultGlbUrl = glb_url || file_url || url;
      const resultS3Key = file_key || s3_key;

      if (!success || !resultGlbUrl) throw new Error("No file_url in response");

      let finalGlbUrl = resultGlbUrl;
      let finalS3Key = resultS3Key || "";


      setGeneratedGlbUrl(finalGlbUrl);
      setGeneratedS3Key(finalS3Key);
      setGeneratedUsdzUrl(null); // Always reset USDZ state on new GLB

      let rawL = backendDimensions?.width || 0;
      let rawW = backendDimensions?.depth || 0;
      let rawH = backendDimensions?.height || 0;

      if (rawL > 10.0 || rawW > 10.0 || rawH > 10.0) {
        const scale = 2.0 / (rawL || 1.0);
        rawL = 2.0;
        rawW = Math.max(0.8, rawW * scale);
        rawH = Math.max(0.5, rawH * scale);
      }

      const lStr = rawL > 0
        ? (Math.round((rawL / 0.3048) * 100) / 100).toString()
        : "0";
      const wStr = rawW > 0
        ? (Math.round((rawW / 0.3048) * 100) / 100).toString()
        : "0";
      const hStr = rawH > 0
        ? (Math.round((rawH / 0.3048) * 100) / 100).toString()
        : "0";
      const newDims = { length: `${lStr}ft`, width: `${wStr}ft`, height: `${hStr}ft` };
      setDimensions(newDims);
      setDimensionInputs({ length: lStr, width: wStr, height: hStr });
      setDimensionUnit("feet");

      if (!originalDimensions) {
        setOriginalDimensions({ length: lStr, width: wStr, height: hStr });
        setOriginalDimensionUnit("feet");
        setOriginalGlbUrl(finalGlbUrl);
        setOriginalS3Key(finalS3Key);
      }

      // NEW: AUTOMATIC USDZ CONVERSION
      try {
        toast.loading("Converting for AR (Apple iOS)...", { id: "gen-toast" });
        const fdUsdz = new FormData();
        fdUsdz.append("s3_key", finalS3Key);
        fdUsdz.append("tier", userTier);
        fdUsdz.append("is_download", "false"); 
        fdUsdz.append("watermark", "true");
        fdUsdz.append("watermark_text", "TryitFirstLabs");
        fdUsdz.append("glb_url", finalGlbUrl);
        
        const usdzRes = await axios.post("/api/convert-usdz", fdUsdz, {
          validateStatus: (status) => status < 500,
          headers: { "x-guest-mac": getGuestMac() }
        });

        if (usdzRes.status === 200 && usdzRes.data?.success) {
           const usdzUrl = usdzRes.data.usdz_url || usdzRes.data.file_url || usdzRes.data.url;
           setGeneratedUsdzUrl(usdzUrl);
        }
      } catch (usdzError) {
        console.error("Automatic USDZ conversion failed:", usdzError);
        // We do not throw, we still show the GLB model!
      }

      toast.success("3D model generated successfully!", {
        id: "gen-toast",
        duration: 3000,
      });

      // THE BUTLER: Save the new generated model to the Logbook
      saveToLogbook({
        glbFile: finalGlbUrl,
        glbFileKey: finalS3Key,
        dimensions: newDims,
        dimensionUnit: "feet"
      });

      await fetchLimits();

      setIsGenerating(false);
      setShowPreview(true);
    } catch (error: any) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") {
        setIsGenerating(false);
        return;
      }
      let msg = "Failed to generate 3D model. Please try again.";

      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        msg = "Generation timed out. Please try fewer images or smaller files.";
      } else if (error.response?.status === 413) {
        msg = "Images are too large. Please reduce the file sizes and try again.";
      } else if (error.message?.includes("Network Error")) {
        msg = "Network connection lost. Please check your internet and try again.";
      } else if (error.response?.data?.error) {
        msg = error.response.data.error;
      }

      toast.error(msg, {
        id: "gen-toast",
        duration: 5000,
      });

      setIsGenerating(false);
    } finally {
      generateAbortRef.current = null;
    }
  };

  const handleRegenerate = async () => {
    setUploadedImages(Array(8).fill(null));
    setGeneratedGlbUrl(null);
    setGeneratedUsdzUrl(null);
    setGeneratedS3Key("");
    setDimensions({ length: "0ft", width: "0ft", height: "0ft" });
    setDimensionInputs({ length: "", width: "", height: "" });
    setDimensionUnit("feet");
    setScaleValue("");
    setOriginalDimensions(null);
    setOriginalDimensionUnit(null);
    setOriginalGlbUrl(null);
    setOriginalS3Key(null);
    setShowPreview(false);
    setIsGenerating(false);
    setShowEditProportions(false);
    setResizeMode("manual");
    setIsResizing(false);

    toast.success("Ready to create a new 3D model. Upload your images to begin.", {
      duration: 3000,
    });
  };

  const handleReset = () => {
    if (!originalDimensions || !originalDimensionUnit || !originalGlbUrl) {
      toast.error(
        "No original dimensions available. This typically means the model hasn't been resized yet.",
        {
          duration: 3000,
        }
      );
      return;
    }

    setDimensionInputs(originalDimensions);
    setDimensionUnit(originalDimensionUnit);
    setGeneratedGlbUrl(originalGlbUrl);
    setGeneratedS3Key(originalS3Key || "");

    const unitMap: Record<string, string> = {
      millimeters: "mm",
      centimeters: "cm",
      inches: "in",
      feet: "ft",
      meters: "m",
    };
    const unit = unitMap[originalDimensionUnit] || "m";
    setDimensions({
      length: `${originalDimensions.length}${unit}`,
      width: `${originalDimensions.width}${unit}`,
      height: `${originalDimensions.height}${unit}`,
    });

    setResizeMode("manual");
    setScaleValue("");

    toast.success("Reset to original dimensions!", {
      duration: 3000,
    });
  };

  const handleConvertToUSDZ = async () => {
    if (isConvertingUSDZ || !generatedS3Key) return;
    setIsConvertingUSDZ(true);
    try {
      const formData = new FormData();
      formData.append("s3_key", generatedS3Key);
      toast.loading("Converting GLB to USDZ…", { id: "usdz-toast", duration: Infinity });
      const response = await axios.post("/api/convert-usdz", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90_000,
      });
      const { success, file_url } = response.data;
      if (!success || !file_url) throw new Error("No file_url in response");
      setGeneratedUsdzUrl(file_url);
      toast.success("USDZ file ready! Downloading…", { id: "usdz-toast", duration: 2000 });
      // Download immediately
      const a = document.createElement("a");
      a.href = file_url;
      a.download = generatedS3Key.replace(/\.glb$/i, ".usdz");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error: any) {
      console.error("USDZ conversion error:", error);
      let msg = "Failed to convert to USDZ. Please try again.";
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        msg = "USDZ conversion timed out. This can take a while for complex models. Please try again.";
      } else if (error.response?.status === 400) {
        msg = error.response?.data?.error || "Invalid GLB file. Please regenerate the model and try again.";
      } else if (error.response?.status === 503 || error.response?.status === 502) {
        msg = "Conversion service temporarily unavailable. Please try again in a moment.";
      } else if (error.message?.includes("Network Error")) {
        msg = "Network connection lost. Please check your internet and try again.";
      } else if (error.response?.data?.error) {
        msg = error.response.data.error;
      }
      toast.error(msg, { id: "usdz-toast", duration: 5000 });
    } finally {
      setIsConvertingUSDZ(false);
    }
  };

  const handleResize = async () => {
    if (!generatedS3Key) {
      toast.error("No 3D model available. Please generate a model first.", {
        duration: 3000,
      });
      return;
    }

    if (resizeMode === "scale") {
      const s = parseFloat(scaleValue);
      if (!scaleValue || isNaN(s) || s <= 0) {
        toast.error(
          "Please enter a scale factor greater than 0 (e.g., 2 to double the size, 0.5 to halve it).",
          {
            duration: 4000,
          }
        );
        return;
      }
      const l = parseFloat(dimensionInputs.length);
      const w = parseFloat(dimensionInputs.width);
      const h = parseFloat(dimensionInputs.height);
      if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
        toast.error("Model dimensions are missing. Please generate a model first.", {
          duration: 3000,
        });
        return;
      }
    } else {
      const l = parseFloat(dimensionInputs.length);
      const w = parseFloat(dimensionInputs.width);
      const h = parseFloat(dimensionInputs.height);
      if (
        !dimensionInputs.length ||
        !dimensionInputs.width ||
        !dimensionInputs.height ||
        isNaN(l) ||
        isNaN(w) ||
        isNaN(h) ||
        l <= 0 ||
        w <= 0 ||
        h <= 0
      ) {
        toast.error(
          "Please enter valid dimensions for length, width, and height. All values must be greater than 0.",
          {
            duration: 4000,
          }
        );
        return;
      }
    }

    setIsResizing(true);

    try {
      const formData = new FormData();
      formData.append("s3_key", generatedS3Key);

      if (resizeMode === "scale") {
        const scale = parseFloat(scaleValue);
        const currentLength = parseFloat(dimensionInputs.length) || 1;
        const currentWidth = parseFloat(dimensionInputs.width) || 1;
        const currentHeight = parseFloat(dimensionInputs.height) || 1;

        const unitMap: Record<string, string> = {
          meters: "m",
          millimeters: "mm",
          centimeters: "cm",
          inches: "in",
          feet: "ft",
        };
        formData.append("depth", (currentWidth * scale).toString());
        formData.append("width", (currentLength * scale).toString());
        formData.append("height", (currentHeight * scale).toString());
        formData.append("unit", unitMap[dimensionUnit] || "m");
      } else {
        const unitMap: Record<string, string> = {
          meters: "m",
          millimeters: "mm",
          centimeters: "cm",
          inches: "in",
          feet: "ft",
        };
        formData.append('depth', dimensionInputs.width);
        formData.append('width', dimensionInputs.length);
        formData.append('height', dimensionInputs.height);
        formData.append('unit', unitMap[dimensionUnit] || "m");
      }

      formData.append('tier', userTier);

      toast.loading("Resizing 3D model… this may take a moment", {
        id: "resize-toast",
        duration: Infinity,
      });

      const response = await axios.post("/api/resize", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      });

      const { success, file_url, glb_url, s3_key, file_key, url } = response.data;
      const resultGlbUrl = glb_url || file_url || url;
      const resultS3Key = file_key || s3_key;

      if (!success || !resultGlbUrl) throw new Error("No file_url in response");

      setGeneratedGlbUrl(resultGlbUrl);
      setGeneratedS3Key(resultS3Key || generatedS3Key);

      const unitMap: Record<string, string> = {
        millimeters: "mm",
        centimeters: "cm",
        inches: "in",
        feet: "ft",
        meters: "m",
      };
      const unit = unitMap[dimensionUnit] || "m";
      const trunc = (v: string) =>
        !v ? "0" : (Math.round(parseFloat(v) * 100) / 100).toString();

      let finalL = dimensionInputs.length;
      let finalW = dimensionInputs.width;
      let finalH = dimensionInputs.height;

      if (resizeMode === "scale") {
        const scale = parseFloat(scaleValue);
        const calcL = (parseFloat(dimensionInputs.length) || 0) * scale;
        const calcW = (parseFloat(dimensionInputs.width) || 0) * scale;
        const calcH = (parseFloat(dimensionInputs.height) || 0) * scale;

        finalL = calcL.toString();
        finalW = calcW.toString();
        finalH = calcH.toString();

        setDimensions({
          length: `${trunc(finalL)}${unit}`,
          width: `${trunc(finalW)}${unit}`,
          height: `${trunc(finalH)}${unit}`,
        });
        setDimensionInputs({
          length: trunc(finalL),
          width: trunc(finalW),
          height: trunc(finalH),
        });
        setScaleValue("");
      } else {
        setDimensions({
          length: `${trunc(finalL)}${unit}`,
          width: `${trunc(finalW)}${unit}`,
          height: `${trunc(finalH)}${unit}`,
        });
      }

      toast.success("Model resized successfully!", {
        id: "resize-toast",
        duration: 3000,
      });

      setGeneratedUsdzUrl(null);

      toast.success("Please convert the new resized GLB to USDZ.", {
        duration: 4000,
      });

      // THE BUTLER: Save the resized model to the Logbook
      saveToLogbook({
        glbFile: file_url,
        glbFileKey: s3_key || generatedS3Key,
        dimensions: {
          length: `${trunc(finalL)}${unit}`,
          width: `${trunc(finalW)}${unit}`,
          height: `${trunc(finalH)}${unit}`
        },
        dimensionUnit: dimensionUnit
      });

      setIsResizing(false);
      setShowEditProportions(false);
    } catch (error: any) {
      console.error("Resize error:", error);

      let msg = "Failed to resize model. Please try again.";

      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        msg = "Resize operation timed out. This can happen with complex models. Please try again.";
      } else if (error.response?.status === 400) {
        msg =
          error.response?.data?.error || "Invalid dimensions provided. Please check your values.";
      } else if (error.response?.status === 503 || error.response?.status === 502) {
        msg = "Resize service temporarily unavailable. Please try again in a moment.";
      } else if (error.message?.includes("Network Error")) {
        msg = "Network connection lost. Please check your internet and try again.";
      } else if (error.response?.data?.error) {
        msg = error.response.data.error;
      }

      toast.error(msg, {
        id: "resize-toast",
        duration: 4000,
      });

      setIsResizing(false);
    }
  };

  const handleContinueDimensions = () => {
    if (generatedS3Key) {
      handleResize();
    } else {
      const unitMap: Record<string, string> = {
        millimeters: "mm",
        centimeters: "cm",
        inches: "in",
        feet: "ft",
        meters: "m",
      };
      const unit = unitMap[dimensionUnit] || "m";
      const trunc = (v: string) =>
        !v ? "0" : (Math.round(parseFloat(v) * 100) / 100).toString();
      setDimensions({
        length: `${trunc(dimensionInputs.length)}${unit}`,
        width: `${trunc(dimensionInputs.width)}${unit}`,
        height: `${trunc(dimensionInputs.height)}${unit}`,
      });
      setShowEditProportions(false);
    }
  };

  const handleOptimizeAndDownload = async () => {
    if (!generatedS3Key) return;
    
    // Bypass Python resizing entirely. Use the direct gltf-transform optimization endpoint
    setIsResizing(true);
    try {
      toast.loading("Optimizing & compressing model...", { id: "optimize-download", duration: Infinity });
      
      const formData = new FormData();
      formData.append("s3_key", generatedS3Key);

      const response = await axios.post("/api/optimize-direct", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      });

      const { success, glb_url } = response.data;
      
      if (!success || !glb_url) throw new Error("Optimization failed");
      
      toast.success("Optimized successfully! Downloading...", { id: "optimize-download", duration: 2000 });
      setIsResizing(false);
      
      // Now download the optimized file
      await handleDownload(toProxied(glb_url)!, "model_optimized.glb");
      
    } catch (error: any) {
      console.error("Optimize error:", error);
      
      let msg = "Failed to optimize model. Please ensure the backend is running.";
      if (error.response?.data?.error) {
        msg = `Optimization failed: ${error.response.data.error}`;
      } else if (error.message) {
        msg = error.message;
      }
      
      toast.error(msg, { id: "optimize-download", duration: 5000 });
      setIsResizing(false);
    }
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      toast.loading(`Downloading ${fileName}...`, { id: `download-${fileName}` });

      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(`${fileName} downloaded successfully!`, {
        id: `download-${fileName}`,
        duration: 3000,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast.error(`Failed to download ${fileName}. Please try again.`, {
        id: `download-${fileName}`,
        duration: 4000,
      });
    }
  };

  const handleCompileAR = async () => {
    if (!arTargetImage || (!generatedGlbUrl && !generatedS3Key)) {
      toast.error("Please provide a target image and ensure you have a generated 3D model.");
      return;
    }
    
    setIsCompilingAR(true);
    try {
      const formData = new FormData();
      formData.append('image', arTargetImage);
      
      const response = await axios.post('/api/compile-mind', formData);
      if (response.data.success) {
         const mindUrl = response.data.mindUrl;
         const viewerUrl = `${window.location.origin}/ar?mind=${encodeURIComponent(mindUrl)}&glb=${encodeURIComponent(generatedGlbUrl || '')}`;
         setArViewerUrl(viewerUrl);
         toast.success("AR Experience generated successfully!");
      } else {
         toast.error(response.data.error || "Failed to compile AR target.");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error compiling AR target");
    } finally {
      setIsCompilingAR(false);
    }
  };

  const handleBackNavigation = () => {
    if (isGenerating) {
      generateAbortRef.current?.abort();
      setIsGenerating(false);
      return;
    }

    if (showEditProportions) {
      setShowEditProportions(false);
      return;
    }

    if (showPreview) {
      setShowPreview(false);
      return;
    }

    onClose();
  };

  const mainModalTitle = isGenerating
    ? "Building your 3D model"
    : showPreview
      ? "Preview & Edit Model"
      : "Generate 3D Model";

  return (
    <>
      {/* Main Studio Modal */}
      <Transition appear show={true} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => { }}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-[100dvh] items-center justify-center p-2 sm:p-4 md:p-6">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className={`relative flex flex-col w-full ${isGenerating ? 'max-w-lg' : showPreview ? 'max-w-5xl' : 'max-w-4xl'} transform rounded-2xl bg-white shadow-2xl transition-all h-[96dvh] sm:h-auto sm:max-h-[92vh]`}>
                  {/* Header */}
                  <div className={`flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-white z-10 rounded-t-2xl flex-shrink-0 ${isGenerating ? 'justify-center' : ''}`}>
                    {!isGenerating && (
                      <button
                        type="button"
                        onClick={handleBackNavigation}
                        className="p-2 sm:p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
                      >
                        <ChevronLeftIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                    )}
                    <Dialog.Title
                      as="h3"
                      className={`text-base sm:text-lg md:text-xl font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2 max-w-[60%] sm:max-w-none truncate sm:truncate-none text-center ${isGenerating ? 'text-gray-800' : ''}`}
                    >
                      {mainModalTitle}
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 sm:p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all active:scale-95 ml-auto"
                    >
                      <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>

                  {/* Content Wrapper with Scroll */}
                  <div className="flex-1 min-h-0 overflow-y-auto w-full no-scrollbar">

                    {/* 1. Upload State */}
                    {!isGenerating && !showPreview && (
                      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8">
                        {/* Instructions */}
                        <div className="flex flex-col gap-3 lg:w-1/3">
                          <div className="flex flex-col justify-center gap-3 p-4 sm:p-6 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 rounded-2xl h-full lg:min-h-[350px] border border-indigo-100/50 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/20 rounded-full blur-2xl pointer-events-none"></div>
                            <div className="text-center relative z-10">
                              <p className="text-sm sm:text-base text-gray-800 font-medium">
                                For best results, include multiple angles
                              </p>
                              <p className="text-[11px] sm:text-xs text-gray-500 mt-1.5 font-medium">
                                (front, back, sides, top, bottom)
                              </p>
                            </div>
                            <div className="flex flex-col items-center gap-2 mt-4 py-2 relative z-10">
                              <div className="text-[10px] text-indigo-500 font-semibold uppercase tracking-widest">Top</div>
                              <div className="relative w-24 h-24 sm:w-28 sm:h-28 my-3">
                                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm opacity-90">
                                  <polygon points="50,20 80,35 80,65 50,80 20,65 20,35" fill="#EEF2FF" stroke="#818CF8" strokeWidth="1.5" strokeLinejoin="round" />
                                  <polygon points="50,20 80,35 50,50 20,35" fill="#E0E7FF" stroke="#818CF8" strokeWidth="1.5" strokeLinejoin="round" />
                                  <polygon points="50,50 80,35 80,65 50,80" fill="#C7D2FE" stroke="#818CF8" strokeWidth="1.5" strokeLinejoin="round" />
                                  <polygon points="50,50 20,35 20,65 50,80" fill="#A5B4FC" stroke="#818CF8" strokeWidth="1.5" strokeLinejoin="round" />
                                </svg>
                                <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-[10px] text-indigo-500 font-semibold uppercase tracking-widest">
                                  Left
                                </div>
                                <div className="absolute -right-10 top-1/2 -translate-y-1/2 text-[10px] text-indigo-500 font-semibold uppercase tracking-widest">
                                  Right
                                </div>
                              </div>
                              <div className="text-[10px] text-indigo-500 font-semibold uppercase tracking-widest">Bottom</div>
                            </div>
                          </div>
                        </div>

                        {/* Upload Grid */}
                        <div className="flex flex-col gap-3 lg:w-2/3">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <h4 className="text-sm sm:text-base font-semibold text-gray-800">
                                Upload Images <span className="text-indigo-500 text-sm font-medium">({uploadedImages.filter(Boolean).length}/8)</span>
                              </h4>
                              <p className="text-[10px] font-medium text-gray-500 bg-gray-100/80 backdrop-blur-sm px-3 py-1 rounded-full self-start sm:self-auto border border-gray-200/50">
                                JPG, PNG, WEBP, AVIF · Max 30MB
                              </p>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                              {[...Array(8)].map((_, index) => {
                                const hasImage = Boolean(uploadedImages[index]);
                                const isEnabled = hasImage || index === 0 || Boolean(uploadedImages[index - 1]);
                                return (
                                  <div key={index} className="flex flex-col gap-1.5">
                                    <div
                                      className={`relative aspect-square rounded-xl border transition-all duration-300 overflow-hidden group ${isEnabled
                                        ? "border-gray-200 border-dashed hover:border-indigo-400 bg-gray-50/50 hover:bg-indigo-50/30 hover:shadow-md"
                                        : "border-gray-100 bg-gray-50/50 opacity-40"
                                        }`}
                                    >
                                      {uploadedImages[index] ? (
                                        <>
                                          <img
                                            src={uploadedImages[index]!.url}
                                            alt={`Upload ${index + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeImage(index)}
                                            className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/90 backdrop-blur-sm text-white rounded-full hover:bg-red-600 hover:scale-110 active:scale-95 transition-all z-10 shadow-sm"
                                          >
                                            <XMarkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                          </button>
                                        </>
                                      ) : (
                                        <label
                                          className={`flex flex-col items-center justify-center w-full h-full ${isEnabled
                                            ? "cursor-pointer"
                                            : "cursor-not-allowed"
                                            } transition-all`}
                                        >
                                          <PhotoIcon className={`w-7 h-7 sm:w-9 sm:h-9 mb-2 transition-colors duration-300 ${isEnabled ? "text-gray-300 group-hover:text-indigo-400" : "text-gray-200"}`} />
                                          <span className={`text-[10px] text-center font-medium px-2 ${isEnabled ? "text-gray-400 group-hover:text-indigo-500" : "text-gray-300"}`}>
                                            Tap to upload
                                          </span>
                                          {isEnabled && (
                                            <input
                                              type="file"
                                              accept="image/*,.avif"
                                              multiple
                                              onChange={(e) => handleImageUpload(index, e)}
                                              className="hidden"
                                            />
                                          )}
                                        </label>
                                      )}
                                    </div>
                                    {uploadedImages[index] && (
                                      <p
                                        className="text-[10px] sm:text-xs font-medium text-gray-500 truncate px-1 text-center"
                                        title={uploadedImages[index]!.name}
                                      >
                                        {uploadedImages[index]!.name}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end mt-5 sm:mt-3">
                            <button
                              type="button"
                              onClick={handleGenerate}
                              disabled={uploadedImages.filter(Boolean).length === 0}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 sm:py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm sm:text-base shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-indigo-500/25 transition-all duration-300"
                            >
                              <SparklesIcon className="w-5 h-5 opacity-90" />
                              <span>Generate 3D Model</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Generating State */}
                    {isGenerating && (
                      <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 sm:px-6 h-full min-h-[50vh] relative overflow-hidden">
                        
                        {/* Futuristic Ambient Halo */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/10 blur-2xl rounded-full pointer-events-none animate-pulse"></div>

                        <div className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] md:w-[240px] md:h-[240px] -mb-2 z-10">
                          <Lottie
                            animationData={LoaderAnimation}
                            loop
                            autoplay
                            className="w-full h-full drop-shadow-lg"
                          />
                        </div>

                        <div className="flex flex-col items-center gap-2 sm:gap-3 max-w-md mx-auto w-full z-10">
                          <h3 className="text-xl sm:text-2xl font-semibold text-gray-800 text-center tracking-tight">
                            Building your 3D model
                          </h3>
                          <div className="h-6 flex items-center justify-center">
                            <p className="text-sm sm:text-base font-medium transition-all duration-500 bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600 animate-pulse">
                              {generationStages[generationStage]}
                            </p>
                          </div>
                          
                          {/* Elegant Glowing Progress Bar */}
                          <div className="w-full max-w-[260px] h-1.5 bg-gray-100/80 rounded-full mt-4 overflow-hidden relative shadow-inner">
                             <div className="h-full bg-gray-100 relative w-full overflow-hidden rounded-full">
                               <div className="absolute top-0 bottom-0 left-0 w-full bg-gradient-to-r from-indigo-50 to-purple-50"></div>
                               <div className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent rounded-full animate-[shimmer_2s_infinite]"></div>
                             </div>
                          </div>

                          <p className="text-[11px] sm:text-xs text-gray-400 text-center mt-3 font-medium">
                            Usually 1—2 minutes. Please keep this window open.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 3. Preview State */}
                    {showPreview && !isGenerating && !showEditProportions && (
                      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8">

                        {/* 3D Viewer Container */}
                        <div className="flex-1 flex items-center justify-center w-full">
                          {/* FIX IMPLEMENTED: Strict heights to prevent modal vertical overflow */}
                          <div className="relative w-full h-[350px] sm:h-[450px] lg:h-[500px] shrink-0 bg-gradient-to-b from-gray-50 to-white rounded-2xl overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100">
                            {generatedGlbUrl && (
                              <ModelPreview3D
                                glbUrl={toProxied(generatedGlbUrl)!}
                                usdzUrl={generatedUsdzUrl}
                                dimensions={dimensions}
                                currentUnit={dimensionUnit}
                                onModelDimensionsDetected={handleModelDimensionsDetected}
                                userTier={userTier}
                              />
                            )}
                          </div>
                        </div>

                        {/* Controls Container */}
                        <div className="flex-1 flex flex-col gap-4 justify-center items-center lg:items-start w-full max-w-md mx-auto lg:max-w-none">

                          {/* Dimensions Card */}
                          <div className="flex flex-col gap-3 p-4 sm:p-5 bg-gradient-to-br from-indigo-50/40 to-purple-50/40 rounded-2xl shadow-sm border border-indigo-100/50 w-full backdrop-blur-sm">
                            <h4 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-widest text-center lg:text-left">
                              Current Dimensions
                            </h4>
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                              {["length", "width", "height"].map((d) => (
                                <div key={d} className="flex flex-col items-center justify-center p-2.5 sm:p-3 bg-white/70 rounded-xl border border-gray-100/50 backdrop-blur-md shadow-[0_2px_4px_rgba(0,0,0,0.01)]">
                                  <span className="text-[10px] sm:text-xs text-indigo-400 mb-1 uppercase tracking-wider font-semibold">{d}</span>
                                  <span className="text-sm sm:text-base font-bold text-gray-800">
                                    {dimensions[d as keyof typeof dimensions]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Usage Counter */}
                          {limits && (
                            <div className="flex items-center justify-between w-full px-5 py-3.5 bg-white/80 border border-gray-100/80 rounded-xl shadow-sm backdrop-blur-sm">
                              <span className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-widest">
                                Generate 3D
                              </span>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 font-semibold text-sm sm:text-base text-gray-800">
                                  <span className={limits.generate3d >= limits.maxGenerate3d ? "text-red-500" : "text-indigo-500"}>
                                    {limits.generate3d}
                                  </span>
                                  <span className="text-gray-300">/</span>
                                  <span className="text-gray-500">{limits.maxGenerate3d}</span>
                                </div>
                                <div className={`w-1.5 h-1.5 rounded-full ${limits.generate3d >= limits.maxGenerate3d ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]'}`}></div>
                              </div>
                            </div>
                          )}
                          

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-3 w-full mt-2">
                            <button
                              type="button"
                              onClick={handleRegenerate}
                              className="flex items-center justify-center gap-2 px-6 py-3.5 sm:py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm sm:text-base shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                            >
                              <ArrowPathIcon className="w-5 h-5 opacity-90" />
                              <span>Regenerate Model</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowEditProportions(true)}
                              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border-2 border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 hover:border-gray-300 transition-all"
                            >
                              <PencilIcon className="w-5 h-5" />
                              <span>Edit proportions</span>
                            </button>
                            
                            {(session?.user?.email === "janapativarsha6@gmail.com" || userTier === "SUPER_ADMIN" || userTier === "PAID") && (
                              <div className="flex gap-3 w-full">
                                <button
                                  type="button"
                                  onClick={() => handleDownload(toProxied(generatedGlbUrl)!, "model.glb")}
                                  disabled={!generatedGlbUrl || isResizing}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 text-indigo-600 font-semibold text-sm hover:bg-indigo-100 hover:border-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <ArrowDownTrayIcon className="w-4 h-4" />
                                  <span>Download GLB</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleConvertToUSDZ}
                                  disabled={isConvertingUSDZ || !generatedS3Key}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 text-indigo-600 font-semibold text-sm hover:bg-indigo-100 hover:border-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <ArrowDownTrayIcon className="w-4 h-4" />
                                  <span>{isConvertingUSDZ ? "Converting..." : "Download USDZ"}</span>
                                </button>
                              </div>
                            )}
                          </div>




                        </div>
                      </div>
                    )}

                    {/* 4. Edit Proportions State */}
                    {showEditProportions && !isGenerating && (
                      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8">
                        {/* Left side: Controls */}
                        <div className="flex-1 flex flex-col gap-6 justify-center w-full max-w-md mx-auto lg:max-w-none">
                          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">How do you want to resize?</h3>
                          
                          {/* Segmented Control */}
                          <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setResizeMode("manual")}
                              className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
                                resizeMode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              Enter exact numbers
                            </button>
                            <button
                              type="button"
                              onClick={() => setResizeMode("scale")}
                              className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
                                resizeMode === "scale" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              Scale it up/down %
                            </button>
                          </div>

                          <div className="flex flex-col gap-4">
                            {resizeMode === "manual" ? (
                              <>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-bold text-gray-700">Units</label>
                                  <select
                                    value={dimensionUnit}
                                    onChange={(e) => handleUnitChange(e.target.value)}
                                    className="w-full sm:w-1/2 rounded-xl border border-gray-300 py-2.5 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm font-medium bg-white"
                                  >
                                    <option value="millimeters">Millimeters</option>
                                    <option value="centimeters">Centimeters</option>
                                    <option value="inches">Inches</option>
                                    <option value="feet">Feet</option>
                                    <option value="meters">Meters</option>
                                  </select>
                                </div>
                                
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-bold text-gray-700">Current &rarr; Result</label>
                                  <div className="grid grid-cols-3 gap-3">
                                    {["length", "width", "height"].map((d) => (
                                      <div key={d} className="flex flex-col gap-1">
                                        <span className="text-xs text-gray-500 capitalize font-semibold text-center">{d}</span>
                                        <input
                                          type="number"
                                          value={dimensionInputs[d as keyof typeof dimensionInputs]}
                                          onChange={(e) => setDimensionInputs({ ...dimensionInputs, [d]: e.target.value })}
                                          className="w-full rounded-xl border border-gray-300 py-2 px-3 text-center text-sm font-medium shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                          placeholder="0.00"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-end gap-4">
                                  <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-sm font-bold text-gray-700">Units</label>
                                    <select
                                      value={dimensionUnit}
                                      onChange={(e) => handleUnitChange(e.target.value)}
                                      className="w-full rounded-xl border border-gray-300 py-2.5 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm font-medium bg-white"
                                    >
                                      <option value="millimeters">Millimeters</option>
                                      <option value="centimeters">Centimeters</option>
                                      <option value="inches">Inches</option>
                                      <option value="feet">Feet</option>
                                      <option value="meters">Meters</option>
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-sm font-bold text-gray-700">Scale Factor</label>
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={decrementScale} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-600 bg-white shadow-sm">
                                        <MinusIcon className="w-4 h-4" />
                                      </button>
                                      <input
                                        type="number"
                                        value={scaleValue}
                                        onChange={(e) => setScaleValue(e.target.value)}
                                        placeholder="1.0"
                                        className="w-full text-center rounded-xl border border-gray-300 py-2 px-3 text-sm font-medium focus:border-indigo-500 focus:ring-indigo-500 shadow-sm"
                                      />
                                      <button type="button" onClick={incrementScale} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-600 bg-white shadow-sm">
                                        <PlusIcon className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1.5 mt-2">
                                  <label className="text-sm font-bold text-gray-700">Current &rarr; Result</label>
                                  <div className="grid grid-cols-3 gap-3">
                                    {["length", "width", "height"].map((d) => {
                                      const current = parseFloat(dimensionInputs[d as keyof typeof dimensionInputs]) || 0;
                                      const factor = parseFloat(scaleValue) || 1;
                                      const result = (current * factor).toFixed(2);
                                      return (
                                        <div key={d} className="flex flex-col gap-1">
                                          <span className="text-xs text-gray-500 capitalize font-semibold text-center">{d}</span>
                                          <div className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-center text-sm font-medium text-gray-700 shadow-sm">
                                            {result}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
                            <button
                              type="button"
                              onClick={() => setShowEditProportions(false)}
                              className="w-full sm:flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50 transition-all text-center"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleReset}
                              className="w-full sm:flex-1 py-3 px-4 rounded-xl border-2 border-orange-400 bg-white text-orange-500 font-bold text-sm hover:bg-orange-50 transition-all flex items-center justify-center gap-1.5"
                            >
                              <ArrowPathIcon className="w-4 h-4" />
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={handleResize}
                              disabled={isResizing}
                              className="w-full sm:flex-[1.5] py-3 px-4 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all text-center flex items-center justify-center"
                            >
                              {isResizing ? "Applying..." : "Apply new size"}
                            </button>
                          </div>
                        </div>

                        {/* Right side: 3D Preview */}
                        <div className="flex-1 flex items-center justify-center w-full">
                          <div className="relative w-full h-[350px] sm:h-[450px] lg:h-[500px] shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 p-2">
                            {generatedGlbUrl && (
                              <ModelPreview3D
                                glbUrl={toProxied(generatedGlbUrl)!}
                                usdzUrl={generatedUsdzUrl}
                                dimensions={dimensions}
                                currentUnit={dimensionUnit}
                                onModelDimensionsDetected={handleModelDimensionsDetected}
                                userTier={userTier}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Limit Reached Popups */}
      <Transition appear show={!!limitModalType} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setLimitModalType(null)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 sm:p-8 text-left align-middle shadow-2xl transition-all border border-gray-100">
                  <Dialog.Title as="h3" className="text-xl sm:text-2xl font-black text-gray-900 mb-3 tracking-tight">
                    {limitModalType === "GUEST" ? "Free Limit Reached! 🚀" : "Daily Limit Reached! 🌟"}
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm sm:text-base text-gray-600 mb-8 leading-relaxed">
                      {limitModalType === "GUEST"
                        ? "You've generated 2 out of 2 free 3D models. Log in or create a free account to unlock more generations and save your creations forever!"
                        : "You've used all of your daily 3D generations. Upgrade your plan to get unlimited high-fidelity models and priority processing."}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 focus:outline-none transition-all"
                      onClick={() => setLimitModalType(null)}
                    >
                      Maybe Later
                    </button>
                    {limitModalType === "GUEST" ? (
                      <button
                        type="button"
                        className="inline-flex justify-center w-full sm:w-auto rounded-xl border border-transparent bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 focus:outline-none shadow-lg shadow-indigo-200 hover:shadow-xl transition-all"
                        onClick={() => {
                          setLimitModalType(null);
                          window.location.href = "/login";
                        }}
                      >
                        Log In / Sign Up
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex justify-center w-full sm:w-auto rounded-xl border border-transparent bg-indigo-400 px-6 py-3 text-sm font-bold text-white cursor-not-allowed opacity-80 shadow-md"
                      >
                        Payment Coming Soon...
                      </button>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

    </>
  );
}
