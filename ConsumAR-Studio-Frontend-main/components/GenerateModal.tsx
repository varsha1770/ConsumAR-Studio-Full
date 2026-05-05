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

/** Proxy S3/EC2 URLs through Next.js to avoid browser CORS blocks */
const toProxied = (url: string | null): string | null =>
  url ? `/api/proxy-model?url=${encodeURIComponent(url)}` : null;

interface GenerateModalProps {
  onClose: () => void;
}

interface UploadedImage {
  url: string;
  name: string;
  file: File;
}

const generationStages = [
  "Initializing processing pipeline…",
  "Sampling geometry data…",
  "Optimizing mesh structure…",
  "Baking textures and final details…",
];

export default function GenerateModal({ onClose }: GenerateModalProps) {
  const [uploadedImages, setUploadedImages] = useState<(UploadedImage | null)[]>(
    Array(8).fill(null)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEditProportions, setShowEditProportions] = useState(false);
  const [generatedGlbUrl, setGeneratedGlbUrl] = useState<string | null>(null);
  const [generatedUsdzUrl, setGeneratedUsdzUrl] = useState<string | null>(null);
  const [generatedS3Key, setGeneratedS3Key] = useState("");
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
  const { data: session } = useSession();

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

  useEffect(() => {
    const fetchTier = async () => {
      try {
        const res = await axios.get("/api/user/limits");
        if (res.data.success) {
          setUserTier(res.data.tier);
        }
      } catch (err) {
        console.error("Failed to fetch tier in GenerateModal:", err);
      }
    };
    fetchTier();
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

      const l = fmt(detected.length);
      const w = fmt(detected.width);
      const h = fmt(detected.height);

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

  const handleImageUpload = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("Invalid file type. Please upload image files (JPG, PNG, WEBP).", {
        duration: 3000,
      });
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    const valid: File[] = [];
    let hasOversizedFiles = false;

    imageFiles.forEach((file) => {
      if (file.size > MAX_SIZE) {
        hasOversizedFiles = true;
        toast.error(`${file.name} is too large (max 5MB). Please use a smaller image.`, {
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
        `Maximum 8 images allowed. ${valid.length - addedCount} image${
          valid.length - addedCount > 1 ? "s" : ""
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
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
        signal: abortController.signal,
      });

      const { success, file_url, s3_key, dimensions: backendDimensions } = response.data;

      if (!success || !file_url) throw new Error("No file_url in response");

      setGeneratedGlbUrl(file_url);
      setGeneratedS3Key(s3_key || "");
      setGeneratedUsdzUrl(null); // Always reset USDZ state on new GLB

      const lStr = backendDimensions?.width
        ? (Math.round((backendDimensions.width / 0.3048) * 100) / 100).toString()
        : "0";
      const wStr = backendDimensions?.depth
        ? (Math.round((backendDimensions.depth / 0.3048) * 100) / 100).toString()
        : "0";
      const hStr = backendDimensions?.height
        ? (Math.round((backendDimensions.height / 0.3048) * 100) / 100).toString()
        : "0";

      const newDims = { length: `${lStr}ft`, width: `${wStr}ft`, height: `${hStr}ft` };
      setDimensions(newDims);
      setDimensionInputs({ length: lStr, width: wStr, height: hStr });
      setDimensionUnit("feet");

      if (!originalDimensions) {
        setOriginalDimensions({ length: lStr, width: wStr, height: hStr });
        setOriginalDimensionUnit("feet");
        setOriginalGlbUrl(file_url);
        setOriginalS3Key(s3_key || "");
      }

      toast.success("3D model generated successfully!", {
        duration: 3000,
      });

      // THE BUTLER: Save the new generated model to the Logbook
      saveToLogbook({
        glbFile: file_url,
        glbFileKey: s3_key,
        dimensions: newDims,
        dimensionUnit: "feet"
      });

      setIsGenerating(false);
      setShowPreview(true);
    } catch (error: any) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") {
        setIsGenerating(false);
        return;
      }

      console.error("Generation error:", error);

      let msg = "Failed to generate 3D model. Please try again.";

      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        msg =
          "Generation timed out. This can happen with many or large images. Try using fewer images or reduce their size.";
      } else if (error.response?.status === 413) {
        msg = "Images are too large. Please reduce the file sizes and try again.";
      } else if (error.response?.status === 400) {
        msg =
          error.response?.data?.error ||
          "Invalid images. Please ensure all files are valid image formats (JPG, PNG, WEBP).";
      } else if (error.response?.status === 503 || error.response?.status === 502) {
        msg = "Service temporarily unavailable. Please try again in a moment.";
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

      const { success, file_url, s3_key } = response.data;

      if (!success || !file_url) throw new Error("No file_url in response");

      setGeneratedGlbUrl(file_url);
      setGeneratedS3Key(s3_key || generatedS3Key);

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
    ? "3D Model Generator - Generating Section"
    : showPreview
    ? "3D Model Generator - Preview Section"
    : "3D Model Generator - Image Upload Section";

  return (
    <>
      <Transition appear show={true} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative flex flex-col w-[calc(100vw-0.75rem)] sm:w-full max-w-5xl transform rounded-xl bg-white shadow-xl transition-all max-h-[96dvh] sm:max-h-[92vh]">
                  {/* Header */}
                  <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-gray-200 bg-white z-10 rounded-t-xl flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleBackNavigation}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                      <ChevronLeftIcon className="w-6 h-6" />
                    </button>
                    <Dialog.Title
                      as="h3"
                      className="text-sm sm:text-lg md:text-xl font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2 max-w-[65%] sm:max-w-none truncate sm:truncate-none text-center"
                    >
                      {mainModalTitle}
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Content Wrapper with Scroll */}
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Upload State */}
                    {!isGenerating && !showPreview && (
                      <div className="flex flex-col lg:flex-row gap-3 p-3">
                      {/* Instructions */}
                      <div className="flex flex-col gap-2 lg:w-1/3">
                        <div className="flex flex-col justify-center gap-2 p-3 bg-gray-50 rounded-lg h-full lg:min-h-[330px]">
                          <p className="text-sm text-gray-700 font-medium">
                            For best results, include multiple angles
                          </p>
                          <p className="text-xs text-gray-500">
                            (front, back, sides, top, bottom)
                          </p>
                          <div className="flex flex-col items-center gap-1 mt-1 py-1">
                            <div className="text-xs text-gray-600 font-medium">Top</div>
                            <div className="relative w-24 h-24">
                              <svg viewBox="0 0 100 100" className="w-full h-full">
                                <polygon
                                  points="50,20 80,35 80,65 50,80 20,65 20,35"
                                  fill="#E0E7FF"
                                  stroke="#6366F1"
                                  strokeWidth="2"
                                />
                                <polygon
                                  points="50,20 80,35 50,50 20,35"
                                  fill="#C7D2FE"
                                  stroke="#6366F1"
                                  strokeWidth="2"
                                />
                                <polygon
                                  points="50,50 80,35 80,65 50,80"
                                  fill="#A5B4FC"
                                  stroke="#6366F1"
                                  strokeWidth="2"
                                />
                                <polygon
                                  points="50,50 20,35 20,65 50,80"
                                  fill="#93C5FD"
                                  stroke="#6366F1"
                                  strokeWidth="2"
                                />
                              </svg>
                              <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-xs text-gray-600">
                                Left
                              </div>
                              <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-xs text-gray-600">
                                Right
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 font-medium">Bottom</div>
                          </div>
                        </div>
                      </div>

                      {/* Upload Grid */}
                      <div className="flex flex-col gap-2 lg:w-2/3">
                        <div className="flex flex-col gap-2">
                          <h4 className="text-sm font-semibold text-gray-700">
                            Upload Images ({uploadedImages.filter(Boolean).length}/8)
                          </h4>
                          <p className="text-xs text-gray-500 border-l-4 border-gray-300 pl-2 py-1 bg-gray-50">
                            JPG, JPEG, PNG, WEBP accepted · max 5MB each
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[...Array(8)].map((_, index) => {
                              const hasImage = Boolean(uploadedImages[index]);
                              const isEnabled = hasImage || index === 0 || Boolean(uploadedImages[index - 1]);
                              return (
                                <div key={index} className="flex flex-col gap-1">
                                  <div
                                    className={`relative aspect-square rounded-lg border-2 border-dashed transition-all overflow-hidden ${
                                      isEnabled
                                        ? "border-gray-300 hover:border-blue-500 bg-gray-50"
                                        : "border-gray-200 bg-gray-100 opacity-60"
                                    }`}
                                  >
                                    {uploadedImages[index] ? (
                                      <>
                                        <img
                                          src={uploadedImages[index]!.url}
                                          alt={`Upload ${index + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeImage(index)}
                                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all z-10"
                                        >
                                          <XMarkIcon className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (
                                      <label
                                        className={`flex flex-col items-center justify-center w-full h-full ${
                                          isEnabled
                                            ? "cursor-pointer hover:bg-gray-100"
                                            : "cursor-not-allowed"
                                        } transition-all`}
                                      >
                                        <PhotoIcon className="w-8 h-8 text-gray-400 mb-1" />
                                        <span className="text-xs text-gray-500 text-center px-2">
                                          Click to upload
                                        </span>
                                        {isEnabled && (
                                          <input
                                            type="file"
                                            accept="image/*"
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
                                      className="text-xs text-gray-600 truncate px-1"
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
                        <div className="flex justify-end mt-1">
                          <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={uploadedImages.filter(Boolean).length === 0}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold text-base hover:shadow-lg hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                          >
                            <SparklesIcon className="w-5 h-5" />
                            <span>Generate</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Generating State */}
                  {isGenerating && (
                    <div className="flex flex-col items-center justify-center py-5 sm:py-6 px-4 sm:px-6">
                      <div className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] -mb-1 sm:-mb-2">
                        <Lottie
                          animationData={LoaderAnimation}
                          loop
                          autoplay
                          className="w-full h-full"
                        />
                      </div>

                      <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                        <h3 className="text-xl font-semibold text-gray-900 text-center">
                          Generating 3D model
                        </h3>
                        <p className="text-sm text-blue-600 text-center font-medium transition-all duration-500">
                          {generationStages[generationStage]}
                        </p>
                      </div>

                      <p className="mt-3 sm:mt-4 text-sm text-gray-500 text-center">
                        This usually takes 1–2 minutes. Please don&apos;t close this window.
                      </p>
                    </div>
                  )}

                  {/* Preview State */}
                  {showPreview && !isGenerating && (
                    <div className="flex flex-col lg:flex-row gap-3 p-3">
                      {/* 3D Viewer */}
                      <div className="flex-1 flex items-center justify-center">
                        <div className="relative w-full h-[240px] sm:h-[320px] lg:h-[380px] bg-black rounded-lg overflow-hidden shadow-md">
                          {generatedGlbUrl && (
                            <ModelPreview3D 
                              glbUrl={toProxied(generatedGlbUrl)!} 
                              dimensions={dimensions} 
                              onModelDimensionsDetected={handleModelDimensionsDetected}
                              userTier={userTier}
                            />
                          )}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex-1 flex flex-col gap-2 justify-center items-center">
                        {/* Dimensions */}
                        <div className="flex flex-col gap-1.5 p-2.5 bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-sm">
                          <h4 className="text-sm font-semibold text-gray-700">
                            Current Dimensions:
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {["length", "width", "height"].map((d) => (
                              <div
                                key={d}
                                className="flex flex-col items-center p-2 bg-gray-50 rounded-lg"
                              >
                                <span className="text-xs text-gray-500 mb-1 capitalize">{d}</span>
                                <span className="text-sm font-semibold text-gray-900">
                                  {dimensions[d as keyof typeof dimensions]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 w-full max-w-xs">
                          <button
                            type="button"
                            onClick={handleRegenerate}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 hover:shadow-lg transition-all"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                            <span>Regenerate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResizeMode("manual");
                              setShowEditProportions(true);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white border-2 border-gray-300 text-gray-700 font-semibold text-sm hover:border-blue-500 hover:shadow-lg transition-all"
                          >
                            <PencilIcon className="w-4 h-4" />
                            <span>Edit proportions</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-center py-1 w-full max-w-xs">
                          <div className="flex-grow border-t-2 border-dashed border-gray-300" />
                          <span className="px-3 text-xs text-gray-400 font-medium">or</span>
                          <div className="flex-grow border-t-2 border-dashed border-gray-300" />
                        </div>

                        {/* Download buttons */}
                        <div className="flex flex-col gap-2 w-full max-w-xs">
                          <button
                            type="button"
                            onClick={() => {
                              if (generatedGlbUrl === originalGlbUrl && userTier !== "PAID") {
                                toast.error("Please click 'Edit proportions' and then 'Apply & Resize' to bake the watermark into your model before downloading.", {
                                  duration: 5000,
                                  id: "watermark-warn"
                                });
                                return;
                              }
                              generatedGlbUrl && handleDownload(toProxied(generatedGlbUrl)!, generatedS3Key ? generatedS3Key.split('/').pop() || "model.glb" : "model.glb");
                            }}
                            disabled={!generatedGlbUrl}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span>Download GLB</span>
                          </button>

                          {!generatedUsdzUrl ? (
                            <button
                              type="button"
                              onClick={handleConvertToUSDZ}
                              disabled={isConvertingUSDZ || !generatedGlbUrl}
                              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                              {isConvertingUSDZ ? (
                                <>
                                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                  <span>Converting...</span>
                                </>
                              ) : (
                                <>
                                  <ArrowPathIcon className="w-4 h-4" />
                                  <span>Convert to USDZ</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownload(toProxied(generatedUsdzUrl)!, generatedS3Key ? generatedS3Key.replace('.glb', '.usdz').split('/').pop() || "model.usdz" : "model.usdz")}
                              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                              <span>Download USDZ</span>
                            </button>
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

      {/* Edit Proportions Modal */}
      <Transition appear show={showEditProportions} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative flex flex-col w-[calc(100vw-0.75rem)] sm:w-full max-w-2xl transform rounded-xl bg-white shadow-xl transition-all max-h-[96dvh] sm:max-h-[92vh]">
                  <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white z-10 rounded-t-xl flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowEditProportions(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                      <ChevronLeftIcon className="w-6 h-6" />
                    </button>
                    <Dialog.Title
                      as="h3"
                      className="text-sm sm:text-lg md:text-xl font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2 max-w-[65%] sm:max-w-none truncate sm:truncate-none text-center"
                    >
                      3D Model Generator - Resize Section
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={() => setShowEditProportions(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="p-3">
                    <div className="flex flex-col gap-2 w-full">
                      <div className="p-2.5 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg">
                        <h3 className="text-sm font-semibold text-white">
                          Set Model Dimensions
                        </h3>
                      </div>

                      {/* Mode Toggle */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">Resize Mode</label>
                        <div className="flex items-center gap-2 p-0.5 bg-gray-100 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setResizeMode("manual")}
                            className={`flex-1 px-4 py-1.5 rounded-md font-medium text-xs transition-all ${
                              resizeMode === "manual"
                                ? "bg-gray-200 text-blue-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            Manual
                          </button>
                          <button
                            type="button"
                            onClick={() => setResizeMode("scale")}
                            className={`flex-1 px-4 py-1.5 rounded-md font-medium text-xs transition-all ${
                              resizeMode === "scale"
                                ? "bg-gray-200 text-blue-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            Scale
                          </button>
                        </div>
                      </div>

                      {/* Unit selector and Scale Factor */}
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs font-semibold text-gray-700">Units</label>
                          <select
                            value={dimensionUnit}
                            onChange={(e) => handleUnitChange(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs"
                          >
                            <option value="meters">Meters</option>
                            <option value="millimeters">Millimeters</option>
                            <option value="centimeters">Centimeters</option>
                            <option value="inches">Inches</option>
                            <option value="feet">Feet</option>
                          </select>
                        </div>

                        {resizeMode === "scale" && (
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-semibold text-gray-700">
                              Scale Factor
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={decrementScale}
                                className="p-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-600 transition-all"
                              >
                                <MinusIcon className="w-3 h-3" />
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="1.0"
                                autoComplete="off"
                                value={scaleValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setScaleValue(v);
                                }}
                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-center text-xs font-semibold"
                              />
                              <button
                                type="button"
                                onClick={incrementScale}
                                className="p-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-600 transition-all"
                              >
                                <PlusIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dimension inputs */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">
                          {resizeMode === "scale" ? "Current → Result" : "Target Dimensions"}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {["length", "width", "height"].map((dim) => {
                            const unitMap: Record<string, string> = {
                              millimeters: "mm",
                              centimeters: "cm",
                              inches: "in",
                              feet: "ft",
                              meters: "m",
                            };
                            const current = parseFloat(dimensionInputs[dim as keyof typeof dimensionInputs]) || 0;
                            const scale = parseFloat(scaleValue) || 1;
                            const result = current * scale;
                            const showResult = resizeMode === "scale" && scaleValue && scale > 0;

                            return (
                              <div key={dim} className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-600 text-center capitalize">
                                  {dim}
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0"
                                  autoComplete="off"
                                  value={dimensionInputs[dim as keyof typeof dimensionInputs]}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "" || /^\d*\.?\d{0,2}$/.test(v))
                                      setDimensionInputs((p) => ({ ...p, [dim]: v }));
                                  }}
                                  disabled={resizeMode === "scale"}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-center text-xs disabled:bg-gray-100 disabled:cursor-not-allowed"
                                />
                                {showResult && (
                                  <div className="text-center text-xs">
                                    <span className="text-gray-400">→ </span>
                                    <span className="font-semibold text-blue-600">
                                      {(Math.round(result * 100) / 100).toString()}
                                      {unitMap[dimensionUnit] || "m"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex flex-col gap-2 mt-1">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleContinueDimensions}
                            disabled={isResizing}
                            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold text-xs hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            {isResizing ? (
                              <span className="flex items-center justify-center gap-2">
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                Resizing...
                              </span>
                            ) : generatedS3Key ? (
                              "Apply & Resize"
                            ) : (
                              "Continue"
                            )}
                          </button>

                          {originalDimensions && (
                            <button
                              type="button"
                              onClick={handleReset}
                              disabled={isResizing}
                              className="flex-1 px-4 py-2 rounded-lg bg-white border-2 border-amber-600 text-amber-700 font-semibold text-xs hover:shadow-lg hover:bg-amber-50 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-1"
                            >
                              <ArrowPathIcon className="w-3 h-3" />
                              Reset
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-center py-0.5">
                          <div className="flex-grow border-t border-gray-300" />
                          <span className="px-3 text-xs text-gray-400">or</span>
                          <div className="flex-grow border-t border-gray-300" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEditProportions(false)}
                          disabled={isResizing}
                          className="w-full px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-600 font-medium text-xs hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
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
