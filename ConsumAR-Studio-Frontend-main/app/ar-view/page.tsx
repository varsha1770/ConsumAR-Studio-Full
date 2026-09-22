"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";

function ARViewer() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [glbUrl, setGlbUrl] = useState<string | null>(searchParams.get("glb"));
  const [usdzUrl, setUsdzUrl] = useState<string | null>(searchParams.get("usdz"));
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);
  const [showSafariModal, setShowSafariModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const modelViewerRef = useRef<any>(null);

  useEffect(() => {
    setIsMounted(true);
    if (!id) return;

    let interval: NodeJS.Timeout;

    const checkLink = async () => {
      try {
        const res = await fetch(`/api/ar-link?id=${id}`);
        const data = await res.json();
        
        if (data.success && data.data) {
          if (data.data.glbUrl) setGlbUrl(data.data.glbUrl);
          
          if (data.data.usdzUrl) {
            setUsdzUrl(data.data.usdzUrl);
            clearInterval(interval);
            setIsLoading(false);
          } else {
            setIsLoading(false);
          }
        } else {
          clearInterval(interval);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch AR link", err);
        clearInterval(interval);
        setIsLoading(false);
      }
    };

    checkLink();
    interval = setInterval(checkLink, 1000);

    return () => clearInterval(interval);
  }, [id]);

  if (!isMounted || (isLoading && !glbUrl)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-800">
        <p className="text-lg font-medium animate-pulse">Loading AR Experience...</p>
      </div>
    );
  }

  if (!glbUrl) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-800">
        <p className="text-lg font-medium">No 3D model provided in the URL.</p>
      </div>
    );
  }

  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  
  const isNonSafariIOS = isIOS && typeof navigator !== 'undefined' && (
    /CriOS|FxiOS|GSA|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line|MicroMessenger|Snapchat|Twitter|Pinterest/i.test(navigator.userAgent) ||
    (!navigator.userAgent.includes("Safari") || (navigator.userAgent.includes("Mobile/") && !navigator.userAgent.includes("Version/")))
  );

  const absoluteUsdz = usdzUrl?.startsWith("/") 
        ? `${window.location.origin}${usdzUrl}`
        : usdzUrl;

  const handleCopyLink = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.error("Failed to copy link:", e);
      alert(`Copy this URL to open in Safari:\n\n${url}`);
    }
  };

  const handleNonIOSClick = () => {
    if (modelViewerRef.current) {
      try {
        modelViewerRef.current.activateAR();
      } catch (e) {
        alert("AR mode requires an iPhone or Android mobile device with a camera. Please scan the QR code on your phone!");
      }
    } else {
      alert("AR mode requires an iPhone or Android mobile device with a camera. Please scan the QR code on your phone!");
    }
  };

  return (
    <div className="h-screen w-screen bg-white relative">
      {/* iOS Non-Safari Banner */}
      {isNonSafariIOS && (
        <div className="absolute top-4 left-4 right-4 z-[4000] bg-amber-50 border border-amber-300 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <span className="text-xl sm:text-2xl">🧭</span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-amber-900 leading-tight">
                Open in Safari for AR View
              </p>
              <p className="text-[11px] sm:text-xs text-amber-700 mt-0.5">
                Tap <strong>Share</strong> or <strong>•••</strong> ➔ <strong>Open in Safari</strong> to start camera AR.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSafariModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 shadow transition-all active:scale-95 cursor-pointer"
          >
            Guide
          </button>
        </div>
      )}

      <model-viewer
        ref={modelViewerRef}
        src={glbUrl}
        ios-src={absoluteUsdz || undefined}
        draco-decoder-location="https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
        alt="3D model AR view"
        bounds="tight"
        shadow-intensity="1"
        camera-controls
        touch-action="pan-y"
        auto-rotate
        ar
        ar-modes="quick-look scene-viewer webxr"
        ar-placement="floor"
        ar-scale="auto"
        style={{ width: "100%", height: "100%" }}
      />

      {/* iOS Direct Quick Look Native Anchor */}
      {isIOS ? (
        isNonSafariIOS ? (
          <button
            onClick={() => setShowSafariModal(true)}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-xl border border-blue-500 transition-all flex items-center justify-center font-bold text-base cursor-pointer bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
          >
            <img src="/TIFLabs-Logo.png" className="w-6 h-6 mr-2 object-contain" alt="AR" />
            <span>Enter AR Mode</span>
          </button>
        ) : absoluteUsdz ? (
          <a
            key={absoluteUsdz}
            rel="ar"
            href={`${absoluteUsdz}#placement=floor&allowsContentScaling=1`}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-xl border border-blue-500 transition-all flex items-center justify-center font-bold text-base cursor-pointer bg-blue-600 text-white hover:bg-blue-700 active:scale-95 no-underline"
          >
            <img src="/TIFLabs-Logo.png" className="w-6 h-6 mr-2 object-contain" alt="AR" />
            <span>Enter AR Mode</span>
          </a>
        ) : (
          <button
            onClick={() => alert("Preparing AR model for your device... Please wait 2 seconds and tap again.")}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-xl border transition-all flex items-center justify-center font-bold text-base cursor-pointer bg-amber-500 border-amber-400 text-white hover:bg-amber-600 active:scale-95"
          >
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            <span>Preparing AR (Tap to check)...</span>
          </button>
        )
      ) : (
        <button
          onClick={handleNonIOSClick}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-xl border border-blue-500 transition-all flex items-center justify-center font-bold text-base bg-blue-600 text-white hover:bg-blue-700 active:scale-95 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v1h1V5H5zm0 8a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1v-3a1 1 0 00-1-1H5zm1 1v1h1v-1H6zm8-9a1 1 0 00-1-1h-3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4zm-1 1v1h-1V5h1zm0 8a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1v-3a1 1 0 00-1-1h-3zm1 1v1h-1v-1h1z" clipRule="evenodd" />
          </svg>
          <span>Enter AR Mode</span>
        </button>
      )}

      {/* Safari Guidance Modal */}
      {showSafariModal && (
        <div className="fixed inset-0 z-[5000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowSafariModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>

            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 text-3xl">
              📱
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Open in Mobile Safari</h3>
            
            <p className="text-xs sm:text-sm text-gray-600 mb-5 leading-relaxed">
              Apple restricts 3D AR Camera view exclusively to <strong>Safari</strong>. You are currently using an in-app browser.
            </p>

            <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-5 text-left text-xs space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">1</span>
                <span className="text-gray-700">Tap the <strong>Share icon</strong> (top right) or <strong>Three Dots (...)</strong> menu.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">2</span>
                <span className="text-gray-700">Select <strong>"Open in Safari"</strong>.</span>
              </div>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              {copied ? "✓ Link Copied! Paste in Safari" : "📋 Copy Link for Safari"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ARViewPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-800">
        <p className="text-lg font-medium animate-pulse">Loading AR Experience...</p>
      </div>
    }>
      <ARViewer />
    </Suspense>
  );
}
