"use client";
import { ArrowDownTrayIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";

interface ModelPreviewProps {
  glbUrl: string;
  usdzUrl: string;
}

export default function ModelPreview({ glbUrl, usdzUrl }: ModelPreviewProps) {
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

  return (
    <div className="space-y-6">
      {/* 3D Viewer */}
      <div className="bg-white rounded-xl overflow-hidden shadow-md">
        <model-viewer
          src={glbUrl}
          ios-src={usdzUrl}
          alt="3D model preview"
          shadow-intensity="1"
          camera-controls
          touch-action="pan-y"
          auto-rotate
          ar
          ar-scale="fixed"
          style={{
            width: "100%",
            height: "400px",
          }}
        >
          <button
            slot="ar-button"
            id="ar-button"
            className="bg-blue-500 shadow-lg p-2 text-white text-xs rounded-lg w-full bottom-0 absolute"
          >
            View in AR
          </button>
        </model-viewer>
      </div>

      {/* Download Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => handleDownload(glbUrl, "model.glb")}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          <ArrowDownTrayIcon className="w-6 h-6" />
          <span>Download GLB</span>
        </button>
        <button
          onClick={() => handleDownload(usdzUrl, "model.usdz")}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          <ArrowDownTrayIcon className="w-6 h-6" />
          <span>Download USDZ</span>
        </button>
      </div>
    </div>
  );
}
