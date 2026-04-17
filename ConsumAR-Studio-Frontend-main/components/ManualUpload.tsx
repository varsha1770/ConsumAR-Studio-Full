"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import toast from "react-hot-toast";
import { CheckCircleIcon, CloudArrowUpIcon } from "@heroicons/react/24/solid";
import { compressGLB } from "../utils/glbCompressor";

const PRESIGNED_URL_ENDPOINT = "/api/presigned-url";
const BUCKET_NAME = "tryitproductmodels";
const INVALID_GLB_TOAST_ID = "invalid-glb-type-toast";
const INVALID_USDZ_TOAST_ID = "invalid-usdz-type-toast";

interface ManualUploadProps {
  onGLBUpload: (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => void;
  onUSDZUpload: (fileUrl: string, fileKey: string, fileName: string) => void;
  currentGlbUrl: string | null;
  currentUsdzUrl: string | null;
  glbFileName: string | null;
  usdzFileName: string | null;
}

export default function ManualUpload({
  onGLBUpload,
  onUSDZUpload,
  currentGlbUrl,
  currentUsdzUrl,
  glbFileName,
  usdzFileName,
}: ManualUploadProps) {
  const [glbUploading, setGlbUploading] = useState(false);
  const [usdzUploading, setUsdzUploading] = useState(false);
  const [glbProgress, setGlbProgress] = useState(0);
  const [usdzProgress, setUsdzProgress] = useState(0);

  const handleUpload = async (file: File, type: "glb" | "usdz") => {
    const isGlb = type === "glb";
    const setUploading = isGlb ? setGlbUploading : setUsdzUploading;
    const setProgress = isGlb ? setGlbProgress : setUsdzProgress;
    const onUpload = isGlb ? onGLBUpload : onUSDZUpload;
    const existingFileUrl = isGlb ? currentGlbUrl : currentUsdzUrl;

    setUploading(true);
    setProgress(0);

    try {
      let fileToUpload = file;

      if (type === "glb") {
        toast.loading("Analyzing geometry format...", { id: `upload-${type}-toast`, duration: Infinity });
        try {
          const { decompressGLBIfDraco } = await import('../utils/glbCompressor');
          fileToUpload = await decompressGLBIfDraco(file);
        } catch (e) {
          console.error("Failed to execute format check:", e);
        }
      }

      // Show loading toast
      toast.loading(`Uploading ${type.toUpperCase()}...`, {
        id: `upload-${type}-toast`,
        duration: Infinity,
      });

      const options = {
        headers: { "Content-Type": "application/octet-stream" },
        onUploadProgress: (progressEvent: any) => {
          const { loaded, total } = progressEvent;
          const percentage = Math.floor((loaded * 100) / total);
          setProgress(percentage);
          console.log(`${type.toUpperCase()} upload progress: ${percentage}%`);
        },
      };

      // Get signed URL from backend
      const response = await axios.get(PRESIGNED_URL_ENDPOINT, {
        params: { bucket_name: BUCKET_NAME, file_type: type },
      });

      if (!response.data || !response.data.upload_url || !response.data.file_key) {
        throw new Error("Failed to get upload URL from server");
      }

      const { upload_url, file_key } = response.data;

      console.log("signed url response:", response.data);
      console.log("file to be uploaded:", fileToUpload);

      // Upload file to S3 using signed URL (same as Frontend)
      const responseUpload = await axios.put(upload_url, fileToUpload, options);

      console.log("upload response:", responseUpload.statusText);

      if (responseUpload.statusText === "OK") {
        const uploadedUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${file_key}`;
        
        if (isGlb) {
          onGLBUpload(uploadedUrl, file_key, file.name, URL.createObjectURL(fileToUpload));
        } else {
          onUSDZUpload(uploadedUrl, file_key, file.name);
        }

        toast.success(`${type.toUpperCase()} uploaded successfully!`, {
          id: `upload-${type}-toast`,
          duration: 3000,
        });
      } else {
        throw new Error(`Upload failed with status: ${responseUpload.statusText}`);
      }
    } catch (error: any) {
      console.error("Upload error:", error);

      let errorMessage = `Failed to upload ${type.toUpperCase()}. Please try again.`;
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        errorMessage = `Upload timed out. Please check your connection and try again.`;
      } else if (error.response?.status === 403) {
        errorMessage = `Access denied. Please check your permissions.`;
      } else if (error.response?.status === 404) {
        errorMessage = `Upload service not found. Please contact support.`;
      } else if (error.message?.includes("Network Error")) {
        errorMessage = `Network error. Please check your internet connection.`;
      } else if (error.message?.includes("upload URL")) {
        errorMessage = `Could not prepare upload. Please try again.`;
      }

      toast.error(errorMessage, {
        id: `upload-${type}-toast`,
        duration: 4000,
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // GLB Dropzone
  const onDropGlb = useCallback(
    (acceptedFiles: File[]) => {
      toast.dismiss(INVALID_GLB_TOAST_ID);
      if (acceptedFiles.length > 0) handleUpload(acceptedFiles[0], "glb");
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
    disabled: glbUploading || usdzUploading,
  });

  // USDZ Dropzone
  const onDropUsdz = useCallback(
    (acceptedFiles: File[]) => {
      toast.dismiss(INVALID_USDZ_TOAST_ID);
      if (acceptedFiles.length > 0) handleUpload(acceptedFiles[0], "usdz");
    },
    [currentUsdzUrl]
  );

  const onDropUsdzRejected = useCallback(() => {
    toast.error("Invalid file type. Please upload a USDZ file.", {
      id: INVALID_USDZ_TOAST_ID,
      duration: 2500,
    });
  }, []);

  const {
    getRootProps: getUsdzRootProps,
    getInputProps: getUsdzInputProps,
    isDragActive: isUsdzDragActive,
  } = useDropzone({
    onDrop: onDropUsdz,
    onDropRejected: onDropUsdzRejected,
    accept: {
      "model/vnd.usdz+zip": [".usdz"],
    },
    maxFiles: 1,
    disabled: glbUploading || usdzUploading,
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
      {/* GLB Upload */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span className="w-0.5 h-3 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></span>
          GLB File
        </h3>
        <div
          {...getGlbRootProps()}
          className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-all overflow-hidden h-[130px] sm:h-[234px] md:h-[294px] lg:h-[150px] flex items-center justify-center ${
            glbUploading || usdzUploading
              ? "border-gray-400 bg-gray-100 cursor-not-allowed"
              : currentGlbUrl
              ? "border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 shadow-md cursor-pointer"
              : isGlbDragActive
              ? "border-blue-500 bg-gradient-to-br from-blue-100 to-purple-100 shadow-lg cursor-pointer"
              : "border-gray-300 hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 hover:shadow-md cursor-pointer"
          }`}
        >
          <input {...getGlbInputProps()} />
          {glbUploading ? (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-blue-500 animate-pulse" />
              <p className="text-xs font-medium text-blue-700">Uploading GLB...</p>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${glbProgress}%` }}
                />
              </div>
              <p className="text-xs text-blue-600">{glbProgress}%</p>
            </div>
          ) : usdzUploading ? (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-gray-400 opacity-50" />
              <p className="text-xs font-medium text-gray-500">Please wait...</p>
              <p className="text-xs text-gray-400">USDZ is uploading</p>
            </div>
          ) : currentGlbUrl ? (
            <div className="space-y-1.5">
              <CheckCircleIcon className="w-8 h-8 mx-auto text-green-500" />
              <p className="text-xs font-medium text-green-700">GLB Uploaded</p>
              {glbFileName && (
                <p className="text-xs font-semibold text-gray-700 truncate px-2">{glbFileName}</p>
              )}
              <p className="text-xs text-gray-500">Click to replace</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-gray-400" />
              <p className="text-xs font-medium text-gray-700">Upload GLB</p>
              <p className="text-xs text-gray-500">
                {isGlbDragActive ? "Drop the file here" : "Drag & drop or click to browse"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* USDZ Upload */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span className="w-0.5 h-3 bg-gradient-to-b from-purple-600 to-purple-400 rounded-full"></span>
          USDZ File
        </h3>
        <div
          {...getUsdzRootProps()}
          className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-all overflow-hidden h-[130px] sm:h-[234px] md:h-[294px] lg:h-[150px] flex items-center justify-center ${
            usdzUploading || glbUploading
              ? "border-gray-400 bg-gray-100 cursor-not-allowed"
              : currentUsdzUrl
              ? "border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 shadow-md cursor-pointer"
              : isUsdzDragActive
              ? "border-purple-500 bg-gradient-to-br from-purple-100 to-blue-100 shadow-lg cursor-pointer"
              : "border-gray-300 hover:border-purple-400 hover:bg-gradient-to-br hover:from-purple-50 hover:to-blue-50 hover:shadow-md cursor-pointer"
          }`}
        >
          <input {...getUsdzInputProps()} />
          {usdzUploading ? (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-purple-500 animate-pulse" />
              <p className="text-xs font-medium text-purple-700">Uploading USDZ...</p>
              <div className="w-full bg-purple-200 rounded-full h-1.5">
                <div
                  className="bg-purple-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${usdzProgress}%` }}
                />
              </div>
              <p className="text-xs text-purple-600">{usdzProgress}%</p>
            </div>
          ) : glbUploading ? (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-gray-400 opacity-50" />
              <p className="text-xs font-medium text-gray-500">Please wait...</p>
              <p className="text-xs text-gray-400">GLB is uploading</p>
            </div>
          ) : currentUsdzUrl ? (
            <div className="space-y-1.5">
              <CheckCircleIcon className="w-8 h-8 mx-auto text-green-500" />
              <p className="text-xs font-medium text-green-700">USDZ Uploaded</p>
              {usdzFileName && (
                <p className="text-xs font-semibold text-gray-700 truncate px-2">{usdzFileName}</p>
              )}
              <p className="text-xs text-gray-500">Click to replace</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <CloudArrowUpIcon className="w-8 h-8 mx-auto text-gray-400" />
              <p className="text-xs font-medium text-gray-700">Upload USDZ</p>
              <p className="text-xs text-gray-500">
                {isUsdzDragActive ? "Drop the file here" : "Drag & drop or click to browse"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
