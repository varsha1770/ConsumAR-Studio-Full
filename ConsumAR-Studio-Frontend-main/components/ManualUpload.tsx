"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import toast from "react-hot-toast";
import { CheckCircleIcon, CloudArrowUpIcon, PlusIcon, ArrowPathIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { getGuestMac } from "@/lib/guest";

const PRESIGNED_URL_ENDPOINT = "/api/presigned-url";
const BUCKET_NAME = "voxel-vista";
const INVALID_GLB_TOAST_ID = "invalid-glb-type-toast";

interface ManualUploadProps {
  onGLBUpload: (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => void;
  currentGlbUrl: string | null;
  glbFileName: string | null;
  variant?: "landing" | "sidebar" | "replacer";
  userTier?: string;
  isOverUploadLimit?: boolean;
  onGenerateClick?: () => void;
}

export default function ManualUpload({
  onGLBUpload,
  currentGlbUrl,
  glbFileName,
  variant = "sidebar",
  userTier = "NON_LOGGED",
  isOverUploadLimit = false,
  onGenerateClick,
}: ManualUploadProps) {
  const [glbUploading, setGlbUploading] = useState(false);
  const [glbProgress, setGlbProgress] = useState(0);

  const handleUpload = async (file: File) => {
    if (isOverUploadLimit) {
      toast.error(
        userTier === "NON_LOGGED"
          ? "You've used your free guest limit. Sign in to upload more!"
          : "Daily upload limit reached. Please upgrade to Pro to upload more."
      );
      return;
    }

    setGlbUploading(true);
    setGlbProgress(0);

    try {
      let fileToUpload = file;

      toast.loading("Analyzing geometry format...", { id: `upload-glb-toast`, duration: Infinity });
      console.log("[ManualUpload] Bypassing optimization for stability check.");

      // Show loading toast
      toast.loading(`Uploading GLB...`, {
        id: `upload-glb-toast`,
        duration: Infinity,
      });

      const options = {
        headers: { "Content-Type": "application/octet-stream" },
        onUploadProgress: (progressEvent: any) => {
          const { loaded, total } = progressEvent;
          const percentage = Math.floor((loaded * 100) / total);
          setGlbProgress(percentage);
          console.log(`GLB upload progress: ${percentage}%`);
        },
      };

      // Get signed URL from backend
      const response = await axios.get(PRESIGNED_URL_ENDPOINT, {
        params: { bucket_name: BUCKET_NAME, file_type: "glb", mac: getGuestMac() },
        headers: { "x-guest-mac": getGuestMac() }
      });

      if (!response.data || !response.data.upload_url || !response.data.file_key) {
        throw new Error("Failed to get upload URL from server");
      }

      let { upload_url, file_key } = response.data;

      // Upload file to S3 using signed URL
      const responseUpload = await axios.put(upload_url, fileToUpload, options);

      if (responseUpload.statusText === "OK") {
        let finalUrl = `https://${BUCKET_NAME}.s3.ap-south-1.amazonaws.com/${file_key}`;
        let finalKey = file_key;
        let finalBlobUrl: string | undefined = URL.createObjectURL(fileToUpload);

        onGLBUpload(finalUrl, finalKey, file.name, finalBlobUrl);


        toast.success(`GLB uploaded successfully!`, {
          id: `upload-glb-toast`,
          duration: 3000,
        });
      } else {
        throw new Error(`Upload failed with status: ${responseUpload.statusText}`);
      }
    } catch (error: any) {
      console.error("Upload error:", error);

      const errorMsg = error.response?.data?.error || "Failed to upload GLB. Please try again.";

      toast.error(errorMsg, {
        id: `upload-glb-toast`,
        duration: 4000,
      });
    } finally {
      setGlbUploading(false);
      setGlbProgress(0);
    }
  };

  // GLB Dropzone
  const onDropGlb = useCallback(
    (acceptedFiles: File[]) => {
      toast.dismiss(INVALID_GLB_TOAST_ID);
      if (acceptedFiles.length > 0) handleUpload(acceptedFiles[0]);
    },
    [currentGlbUrl]
  );

  const onDropGlbRejected = useCallback(() => {
    toast.error("Invalid file type. Please upload a GLB or GLTF file.", {
      id: INVALID_GLB_TOAST_ID,
      duration: 2500,
    });
  }, []);

  const {
    getRootProps: getGlbRootProps,
    getInputProps: getGlbInputProps,
    isDragActive: isGlbDragActive,
  } = useDropzone({
    onDrop: onDropGlb,
    onDropRejected: onDropGlbRejected,
    accept: {
      "model/gltf-binary": [".glb"],
      "model/gltf+json": [".gltf"],
    },
    maxFiles: 1,
    disabled: glbUploading,
  });

  if (variant === "replacer") {
    return (
      <div {...getGlbRootProps()} className="relative group cursor-pointer">
        <input {...getGlbInputProps()} />
        <div className={`w-12 h-12 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center transition-all duration-300 outline-none focus:outline-none focus:ring-0 ${glbUploading ? 'opacity-50 cursor-wait' : 'hover:scale-110 hover:shadow-xl active:scale-95'}`}>
          {glbUploading ? (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <ArrowPathIcon className="w-5 h-5 text-blue-600 outline-none" />
          )}
        </div>
        {/* Progress Overlay if uploading */}
        {glbUploading && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] px-1.2 rounded-full font-bold">
            {glbProgress}%
          </div>
        )}
      </div>
    );
  }

  if (variant === "landing") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full p-2 sm:p-4">
        {/* CARD 1: GLB DROPZONE */}
        <div
          {...getGlbRootProps()}
          className={`relative w-full border-2 border-dashed rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 text-center transition-all duration-300 overflow-hidden flex flex-col items-center justify-center min-h-[160px] bg-gradient-to-br from-gray-50/50 to-white/50 hover:from-blue-50/50 hover:to-purple-50/50 focus:outline-none ${
            glbUploading
              ? "border-gray-300 bg-gray-50 cursor-not-allowed"
              : currentGlbUrl
              ? "border-green-400/50 bg-green-50/30 shadow-lg cursor-pointer hover:border-green-500"
              : isGlbDragActive
              ? "border-blue-500 bg-blue-50/50 scale-[1.02] shadow-2xl ring-4 ring-blue-500/10"
              : "border-gray-200 hover:border-blue-400/60 hover:shadow-xl cursor-pointer group/drop"
          }`}
        >
          <input {...getGlbInputProps()} />

          {glbUploading ? (
            <div className="space-y-3 sm:space-y-4 w-full px-2 sm:px-4">
              <CloudArrowUpIcon className="mx-auto text-blue-500 animate-spin w-12 h-12 sm:w-16 sm:h-16" />
              <div className="space-y-2">
                <p className="font-semibold text-blue-700 uppercase tracking-widest text-sm sm:text-base">
                  Optimizing & Uploading...
                </p>
                <div className="w-full max-w-[16rem] bg-blue-100/80 rounded-full h-1.5 sm:h-2 mx-auto overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(37,99,235,0.5)]"
                    style={{ width: `${glbProgress}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs font-bold text-blue-500">{glbProgress}%</p>
              </div>
            </div>
          ) : currentGlbUrl ? (
            <div className="space-y-1.5 sm:space-y-2 w-full px-2 sm:px-4 flex flex-col items-center">
              <CheckCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-green-500 drop-shadow-sm" />
              <p className="font-bold text-green-700 uppercase tracking-wide text-sm sm:text-base">GLB Uploaded</p>
              {glbFileName && (
                <p className="font-semibold text-gray-900 truncate w-full text-xs sm:text-sm max-w-[200px] sm:max-w-sm">
                  {glbFileName}
                </p>
              )}
              <p className="text-[9px] sm:text-[10px] text-gray-400/80 hover:text-gray-500 transition-colors uppercase font-bold mt-1 sm:mt-2">Click to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full py-2 sm:py-4 space-y-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 shadow-md border border-gray-100 group-hover/drop:scale-110 transition-transform duration-500 relative">
                <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-ping group-hover/drop:animate-none"></div>
                <CloudArrowUpIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 relative z-10" />
              </div>
              <div>
                <p className="text-sm sm:text-base font-bold text-gray-900 uppercase tracking-tight">
                  {isGlbDragActive ? "Drop to Import" : "Ready to Launch?"}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1 font-medium px-4 max-w-[280px] sm:max-w-none mx-auto leading-relaxed">
                  {isGlbDragActive ? "Let it go!" : "Click to browse or drag & drop your GLB file."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-4 justify-center mt-1">
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[9px] uppercase font-bold text-gray-500 bg-gray-50/50 px-2.5 py-1 sm:py-1.5 rounded-full border border-gray-200 shadow-sm transition-all hover:bg-white hover:border-gray-300">
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_4px_#22c55e]"></span>
                  High Fidelity
                </div>
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[9px] uppercase font-bold text-gray-500 bg-gray-50/50 px-2.5 py-1 sm:py-1.5 rounded-full border border-gray-200 shadow-sm transition-all hover:bg-white hover:border-gray-300">
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_#3b82f6]"></span>
                  AR Optimized
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CARD 2: GENERATE FROM IMAGES (Independent Card outside GLB Dropzone) */}
        <div
          className="relative w-full border-2 border-dashed border-purple-200/70 hover:border-purple-300 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 text-center transition-all duration-300 overflow-hidden flex flex-col items-center justify-center min-h-[160px] bg-gradient-to-br from-indigo-50/40 via-purple-50/30 to-white group/gen cursor-default"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm border border-purple-100 group-hover/gen:scale-110 transition-transform duration-300">
            <SparklesIcon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm sm:text-base font-bold text-gray-900 uppercase tracking-tight">Generate from Images</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1 font-medium px-4 max-w-[260px] mx-auto leading-relaxed">
              Instantly convert your 2D photos into stunning 3D models.
            </p>
          </div>
          {onGenerateClick && (
            <button
              type="button"
              onClick={onGenerateClick}
              className="mt-3 px-5 py-2.5 text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-full hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <SparklesIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              Generate 3D Model
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 w-full">
      {/* GLB Upload */}
      <div className="space-y-2 sm:space-y-3 w-full">
        <h3 className="text-sm sm:text-base font-medium text-gray-700 flex items-center gap-1.5 sm:gap-2">
          <span className="w-0.5 h-3.5 sm:h-4 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></span>
          Upload GLB File
        </h3>
        <div
          {...getGlbRootProps()}
          className={`relative w-full border-2 border-dashed rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 text-center transition-all duration-300 overflow-hidden flex items-center justify-center h-full min-h-[140px] sm:min-h-[180px] ${
            glbUploading
              ? "border-gray-300 bg-gray-50 cursor-not-allowed"
              : currentGlbUrl
              ? "border-green-400/50 bg-green-50/30 shadow-lg cursor-pointer hover:border-green-500"
              : isGlbDragActive
              ? "border-blue-500 bg-blue-50/50 scale-[1.02] shadow-2xl ring-4 ring-blue-500/10"
              : "border-gray-200 hover:border-blue-400/60 hover:shadow-xl cursor-pointer"
          }`}
        >
          <input {...getGlbInputProps()} />

          {glbUploading ? (
            <div className="space-y-3 sm:space-y-4 w-full px-2 sm:px-4">
              <CloudArrowUpIcon className="mx-auto text-blue-500 animate-spin w-8 h-8 sm:w-10 sm:h-10" />
              <div className="space-y-2">
                <p className="font-semibold text-blue-700 uppercase tracking-widest text-[10px] sm:text-xs">
                  Optimizing & Uploading...
                </p>
                <div className="w-full max-w-[12rem] bg-blue-100/80 rounded-full h-1.5 sm:h-2 mx-auto overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(37,99,235,0.5)]"
                    style={{ width: `${glbProgress}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs font-bold text-blue-500">{glbProgress}%</p>
              </div>
            </div>
          ) : currentGlbUrl ? (
            <div className="space-y-1.5 sm:space-y-2 w-full px-2 sm:px-4 flex flex-col items-center">
              <CheckCircleIcon className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-green-500 drop-shadow-sm" />
              <p className="font-bold text-green-700 uppercase tracking-wide text-[10px] sm:text-xs">GLB Uploaded</p>
              {glbFileName && (
                <p className="font-semibold text-gray-900 truncate w-full text-[9px] sm:text-[10px] max-w-[140px] sm:max-w-[200px]">
                  {glbFileName}
                </p>
              )}
              <p className="text-[9px] sm:text-[10px] text-gray-400/80 hover:text-gray-500 transition-colors uppercase font-bold mt-1 sm:mt-2">Click to replace</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3 px-2 sm:px-4 flex flex-col items-center justify-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 shadow-md border border-gray-100 group-hover/drop:scale-110 transition-transform duration-500 relative">
                <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-ping group-hover/drop:animate-none"></div>
                <CloudArrowUpIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 relative z-10" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-tight">
                  {isGlbDragActive ? "Drop to Import" : "Drop your Model"}
                </p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 font-medium px-4 sm:px-8 max-w-[280px] sm:max-w-none mx-auto leading-relaxed">
                  {isGlbDragActive ? "Let it go!" : "Click to browse or drag & drop your GLB file."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
