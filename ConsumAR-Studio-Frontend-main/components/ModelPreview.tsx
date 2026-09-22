"use client";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { QRCodeSVG } from 'qrcode.react';
import toast from "react-hot-toast";
import { useEffect, useState } from "react";

interface ModelPreviewProps {
  glbUrl: string;
  usdzUrl: string;
}

export default function ModelPreview({ glbUrl, usdzUrl }: ModelPreviewProps) {
  const [isMobileDevice, setIsMobileDevice] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [localIp, setLocalIp] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setIsMobileDevice(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    setLocalIp(window.location.host);
  }, []);

  const [shortId, setShortId] = useState("");

  useEffect(() => {
    if (!glbUrl && !usdzUrl) return;
    const fetchShortId = async () => {
      try {
        const res = await fetch("/api/ar-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glbUrl, usdzUrl })
        });
        const data = await res.json();
        if (data.id) setShortId(data.id);
      } catch (err) {
        console.error("Failed to generate short AR link", err);
      }
    };
    fetchShortId();
  }, [glbUrl, usdzUrl]);

  const qrUrl = (isMounted && localIp && shortId) ? `http://${localIp}/ar-view?id=${shortId}` : '';

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
    <div className="space-y-4 sm:space-y-6 w-full max-w-5xl mx-auto">
      {/* 3D Viewer */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 relative aspect-square sm:aspect-[4/3] md:aspect-video w-full">
        <style>{`
          #ar-button { display: flex !important; }
        `}</style>
        <model-viewer
          src={glbUrl}
          ios-src={usdzUrl}
          draco-decoder-location="https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
          alt="3D model preview"
          bounds="tight"
          shadow-intensity="1"
          camera-controls
          touch-action="pan-y"
          auto-rotate
          ar
          ar-modes="quick-look scene-viewer webxr"
          ar-placement="floor"
          ar-scale="auto"
          // Let the wrapper's aspect ratio dictate the size
          style={{ width: "100%", height: "100%" }}
        >
          {isMobileDevice && (
            <button
              slot="ar-button"
              id="ar-button"
              className="shadow-lg py-3 px-6 font-bold rounded-xl absolute bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-auto transition-all items-center justify-center gap-2 bg-blue-600/90 backdrop-blur-md text-white active:scale-95 cursor-pointer flex"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h4M12 18v3M4 6h16M4 10h16M4 14h16" />
              </svg>
              View in Space
            </button>
          )}
        </model-viewer>

        {!isMobileDevice && (
          <button
            onClick={() => setShowQRModal(true)}
            className="shadow-lg py-3 px-6 font-bold rounded-xl absolute bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-auto transition-all items-center justify-center gap-2 bg-white text-blue-600 border border-white hover:bg-blue-50 hover:scale-105 active:scale-95 cursor-pointer flex"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan for AR
          </button>
        )}

        {showQRModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full relative flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
              <button 
                onClick={() => setShowQRModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">View in your space</h3>
              <p className="text-sm text-gray-500 mb-6">Scan this QR code with your phone's camera to instantly view this 3D model in Augmented Reality.</p>
              
              <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 mb-4">
                {qrUrl ? <QRCodeSVG value={qrUrl} size={180} /> : null}
              </div>
              
              <p className="text-xs text-gray-400">Works on iPhone and Android</p>
            </div>
          </div>
        )}
      </div>

      {/* Download Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
        <button
          onClick={() => handleDownload(glbUrl, "model.glb")}
          className="flex items-center justify-center gap-2.5 sm:gap-3 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm sm:text-base rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-xl active:scale-[0.98] sm:hover:-translate-y-0.5"
        >
          <ArrowDownTrayIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>Download GLB</span>
        </button>
        <button
          onClick={() => handleDownload(usdzUrl, "model.usdz")}
          className="flex items-center justify-center gap-2.5 sm:gap-3 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold text-sm sm:text-base rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-xl active:scale-[0.98] sm:hover:-translate-y-0.5"
        >
          <ArrowDownTrayIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>Download USDZ</span>
        </button>
      </div>
    </div>
  );
}
