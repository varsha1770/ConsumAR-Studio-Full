"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import toast from "react-hot-toast";
import { CheckCircleIcon, CloudArrowUpIcon, PlusIcon, ArrowPathIcon } from "@heroicons/react/24/solid";

const PRESIGNED_URL_ENDPOINT = "/api/presigned-url";
const BUCKET_NAME = "tryitproductmodels";
const INVALID_GLB_TOAST_ID = "invalid-glb-type-toast";

interface ManualUploadProps {
  onGLBUpload: (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => void;
  currentGlbUrl: string | null;
  glbFileName: string | null;
  variant?: "landing" | "sidebar" | "replacer";
}

export default function ManualUpload({
  onGLBUpload,
  currentGlbUrl,
  glbFileName,
  variant = "sidebar",
}: ManualUploadProps) {
  const [glbUploading, setGlbUploading] = useState(false);
  const [glbProgress, setGlbProgress] = useState(0);

  const handleUpload = async (file: File) => {
    setGlbUploading(true);
    setGlbProgress(0);

    try {
      let fileToUpload = file;

      toast.loading("Analyzing geometry format...", { id: `upload-glb-toast`, duration: Infinity });
      /* 
      try {
        const { decompressGLBIfDraco } = await import('../utils/glbCompressor');
        fileToUpload = await decompressGLBIfDraco(file);
      } catch (e) {
        console.error("Failed to execute format check:", e);
      }
      */
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
        params: { bucket_name: BUCKET_NAME, file_type: "glb" },
      });

      if (!response.data || !response.data.upload_url || !response.data.file_key) {
        throw new Error("Failed to get upload URL from server");
      }

      const { upload_url, file_key } = response.data;

      // Upload file to S3 using signed URL
      const responseUpload = await axios.put(upload_url, fileToUpload, options);

      if (responseUpload.statusText === "OK") {
        const uploadedUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${file_key}`;
        onGLBUpload(uploadedUrl, file_key, file.name, URL.createObjectURL(fileToUpload));

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

  return (
    <div className="grid grid-cols-1 gap-2">
      {/* GLB Upload */}
      <div className="space-y-1.5 w-full">
        {variant !== "landing" && (
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></span>
            Upload GLB File
          </h3>
        )}
        <div
          {...getGlbRootProps()}
          className={`relative border-2 border-dashed rounded-[2rem] p-4 text-center transition-all duration-300 overflow-hidden flex items-center justify-center group/drop ${
            variant === "landing" 
              ? "min-h-[120px] bg-gradient-to-br from-gray-50/50 to-white/50 hover:from-blue-50/50 hover:to-purple-50/50 focus:outline-none" 
              : "h-full min-h-[160px]"
          } ${
            glbUploading
              ? "border-gray-300 bg-gray-50 cursor-not-allowed"
              : currentGlbUrl
              ? "border-green-400/50 bg-green-50/30 shadow-lg cursor-pointer"
              : isGlbDragActive
              ? "border-blue-500 bg-blue-50/50 scale-[1.02] shadow-2xl ring-4 ring-blue-500/10"
              : "border-gray-200 hover:border-blue-400/60 hover:shadow-xl cursor-not-allowed sm:cursor-pointer"
          }`}
        >
          <input {...getGlbInputProps()} />
          {glbUploading ? (
            <div className="space-y-4">
              <CloudArrowUpIcon className={`mx-auto text-blue-500 animate-spin ${variant === "landing" ? "w-16 h-16" : "w-8 h-8"}`} />
              <div className="space-y-2">
                <p className={`font-semibold text-blue-700 uppercase tracking-widest ${variant === "landing" ? "text-lg" : "text-xs"}`}>
                  Optimizing & Uploading...
                </p>
                <div className={`${variant === "landing" ? "w-64" : "w-32 sm:w-48"} bg-blue-100 rounded-full h-2 mx-auto`}>
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${glbProgress}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-blue-500">{glbProgress}%</p>
              </div>
            </div>
          ) : currentGlbUrl ? (
            <div className="space-y-1.5">
              <CheckCircleIcon className={`${variant === "landing" ? "w-16 h-16" : "w-10 h-10"} mx-auto text-green-500`} />
              <p className={`font-semibold text-green-700 uppercase ${variant === "landing" ? "text-base" : "text-xs"}`}>GLB Uploaded</p>
              {glbFileName && (
                <p className={`font-semibold text-gray-900 truncate px-2 ${variant === "landing" ? "text-sm max-w-sm" : "text-[10px]"}`}>{glbFileName}</p>
              )}
              <p className="text-[10px] text-gray-400 uppercase font-semibold mt-2">Click to replace</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`${variant === "landing" ? "w-12 h-12" : "w-12 h-12"} bg-white rounded-full flex items-center justify-center mx-auto mb-1 shadow-lg border border-gray-100 group-hover/drop:scale-110 transition-transform duration-500 relative`}>
                <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-ping group-hover/drop:animate-none"></div>
                <CloudArrowUpIcon className={`${variant === "landing" ? "w-6 h-6" : "w-6 h-6"} text-blue-600 relative z-10`} />
              </div>
              <div>
                <p className={`${variant === "landing" ? "text-base" : "text-sm"} font-semibold text-gray-900 uppercase tracking-tight`}>
                  {isGlbDragActive ? "Drop to Import" : (variant === "landing" ? "Ready to Launch?" : "Drop your Model")}
                </p>
                <p className={`${variant === "landing" ? "text-xs text-gray-500 mt-0.5" : "text-[10px] text-gray-400 uppercase tracking-widest"} font-semibold px-8`}>
                  {isGlbDragActive ? "Let it go!" : "Click to browse or drag & drop your GLB file."}
                </p>
              </div>
              {variant === "landing" && (
                <div className="flex gap-4 justify-center pt-3">
                   <div className="flex items-center gap-1 text-[8px] uppercase font-semibold text-gray-400 bg-gray-50/30 px-2 py-1 rounded-full border border-gray-100">
                      <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                      High Fidelity
                   </div>
                   <div className="flex items-center gap-1 text-[8px] uppercase font-semibold text-gray-400 bg-gray-50/30 px-2 py-1 rounded-full border border-gray-100">
                      <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></span>
                      AR Optimized
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
