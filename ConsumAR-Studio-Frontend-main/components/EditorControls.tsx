"use client";
import { useState, useEffect, useRef } from "react";
import { MinusIcon, PlusIcon, ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/solid";
import { QRCodeSVG } from 'qrcode.react';

interface EditorControlsProps {
  dimensionUnit: string;
  handleUnitChange: (unit: string) => void;
  resizeMode: "manual" | "scale";
  setResizeMode: (mode: "manual" | "scale") => void;
  scaleValue: string;
  setScaleValue: (val: string) => void;
  incrementScale: () => void;
  decrementScale: () => void;
  dimensionInputs: { length: string; width: string; height: string };
  setDimensionInputs: React.Dispatch<React.SetStateAction<{ length: string; width: string; height: string }>>;
  unitLabel: Record<string, string>;
  userTier: string;
  isSuperAdmin: boolean;
  usageStats: any;
  isResizing: boolean;
  glbFileKey: string | null;
  glbFile: string | null;
  handleApply: (forceWatermarkOverride?: boolean) => void;
  handleReset: () => void;
  handleDownload: (url: string, name: string, draco?: boolean) => void;
  handleConvert: (isOriginal?: boolean) => void;
  handleConvertOriginal: () => void;
  handleRemoveWatermark: () => void;
  toProxied: (url: string | null) => string | null;
  triggerUpgrade: (msg?: string) => void;
  originalDimensions: any;
  originalDimensionUnit: string | null;
  rawModelDimensions: any;
  originalGlbKey: string | null;
  forceWatermark: boolean;
  setForceWatermark: (val: boolean) => void;
  watermarkText: string;
  setWatermarkText: (val: string) => void;
  isSampleModel?: boolean;
  convertedUsdzUrl?: string | null;
}

export default function EditorControls({
  dimensionUnit,
  handleUnitChange,
  resizeMode,
  setResizeMode,
  scaleValue,
  setScaleValue,
  incrementScale,
  decrementScale,
  dimensionInputs,
  setDimensionInputs,
  unitLabel,
  userTier,
  isSuperAdmin,
  usageStats,
  isResizing,
  glbFileKey,
  glbFile,
  handleApply,
  handleReset,
  handleDownload,
  handleConvert,
  handleConvertOriginal,
  handleRemoveWatermark,
  toProxied,
  triggerUpgrade,
  originalDimensions,
  originalDimensionUnit,
  rawModelDimensions,
  originalGlbKey,
  forceWatermark,
  setForceWatermark,
  watermarkText,
  setWatermarkText,
  isSampleModel,
  convertedUsdzUrl
}: EditorControlsProps) {
  // --- Tier Logic Constants ---
  const isPaid = userTier === "PAID" || isSuperAdmin;
  const isLogged = userTier === "FREE";
  const isGuest = userTier === "NON_LOGGED";

  const [shortId, setShortId] = useState("");
  const shortIdRef = useRef<string>("");

  useEffect(() => {
    if (!glbFile && !convertedUsdzUrl) return;
    
    // Generate ID synchronously to prevent race conditions
    if (!shortIdRef.current) {
      const newId = Math.random().toString(36).substring(2, 8);
      shortIdRef.current = newId;
      setShortId(newId);
    }

    const fetchShortId = async () => {
      try {
        await fetch("/api/ar-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            id: shortIdRef.current,
            glbUrl: toProxied(glbFile || null), 
            usdzUrl: toProxied(convertedUsdzUrl || null) 
          })
        });
      } catch (err) {
        console.error("Failed to update AR link", err);
      }
    };
    fetchShortId();
  }, [glbFile, convertedUsdzUrl]);

  // --- Feature Gating Logic ---
  const canRescale = () => {
    if (isPaid) return true;
    if (!usageStats) return false;
    if (usageStats.rescales >= usageStats.maxRescales) return false;
    if (usageStats.maxRescalesMonth !== undefined && usageStats.rescalesMonth >= usageStats.maxRescalesMonth) return false;
    return true;
  };

  const canConvertUSDZ = () => {
    if (isPaid) return true;
    if (!usageStats) return false;
    if (usageStats.usdz >= usageStats.maxUsdz) return false;
    if (usageStats.maxUsdzMonth !== undefined && usageStats.usdzMonth >= usageStats.maxUsdzMonth) return false;
    return true;
  };

  return (
    <div className="w-full lg:w-[350px] xl:w-[380px] flex flex-col space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm sm:text-base lg:text-sm font-semibold tracking-widest uppercase text-indigo-500">Edit Dimensions</h3>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-indigo-100 via-purple-100 to-transparent"></div>
      </div>
      <div className="flex-1 flex flex-col gap-4 sm:gap-6 lg:gap-4 p-4 sm:p-6 lg:p-4 glass-morphism rounded-2xl">
        <div className="flex p-1 bg-white/50 backdrop-blur-sm rounded-xl border border-white/60">
          <button onClick={() => setResizeMode("manual")} className={`flex-1 py-2 sm:py-2.5 lg:py-2 rounded-lg text-xs sm:text-sm lg:text-xs font-medium transition-all ${resizeMode === "manual" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Manual</button>
          <button onClick={() => setResizeMode("scale")} className={`flex-1 py-2 sm:py-2.5 lg:py-2 rounded-lg text-xs sm:text-sm lg:text-xs font-medium transition-all ${resizeMode === "scale" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Scale</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs sm:text-sm lg:text-xs font-semibold text-gray-700">Units</label>
          <select value={dimensionUnit} onChange={(e) => handleUnitChange(e.target.value)} className="w-full px-3 py-2 sm:py-2.5 lg:py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white text-sm sm:text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {["centimeters", "feet", "meters", "millimeters", "inches"].map(u => {
              const allowedUnits = usageStats?.allowedUnits || ["centimeters"];
              // FORCE UNLOCK: CM and Feet are always allowed for logged-in users
              const isTierUnlocked = (userTier === "FREE" || isPaid) && (u === "centimeters" || u === "feet");
              let isLocked = !allowedUnits.includes(u) && !isTierUnlocked;

              if (isPaid) isLocked = false; // Paid users have everything

              return (
                <option key={u} value={u} disabled={isLocked} className={isLocked ? "text-gray-400" : ""}>
                  {u.charAt(0).toUpperCase() + u.slice(1)} {isLocked ? "🔒" : ""}
                </option>
              );
            })}
          </select>
        </div>

        {resizeMode === "scale" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm lg:text-xs font-semibold text-gray-700">Scale Factor</label>
            <div className="flex items-center gap-2">
              <button onClick={decrementScale} className="p-2 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><MinusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-3 lg:h-3" /></button>
              <input type="text" value={scaleValue} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setScaleValue(e.target.value)} className="w-full px-2 py-2 sm:py-2.5 lg:py-1.5 border border-gray-300 rounded-lg text-center text-sm sm:text-base lg:text-sm font-semibold shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="1.0" />
              <button onClick={incrementScale} className="p-2 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><PlusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-3 lg:h-3" /></button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs sm:text-sm lg:text-xs font-semibold text-gray-700">Target Dimensions</label>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-2">
            {["length", "width", "height"].map(dim => {
              const val = dimensionInputs[dim as keyof typeof dimensionInputs];
              const s = parseFloat(scaleValue) || 1.0;
              const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };

              const origVal = parseFloat(originalDimensions?.[dim]) || 0;

              // V176: Normalization Fix. If unit is 'meters' but any value is > 10, it's almost certainly CM.
              let actualOrigUnit = originalDimensionUnit || "meters";
              const isHuge = (parseFloat(originalDimensions?.length) > 10 || parseFloat(originalDimensions?.width) > 10 || parseFloat(originalDimensions?.height) > 10);
              if (actualOrigUnit === "meters" && isHuge) {
                actualOrigUnit = "centimeters";
              }

              const valInMm = origVal * (toMm[actualOrigUnit] || 1000);
              const targetFactor = 1 / (toMm[dimensionUnit] || 1000);
              const rawVal = valInMm * targetFactor;

              const res = resizeMode === "scale" ? (isNaN(rawVal) ? 0 : rawVal * s) : (parseFloat(val) || 0);

              // V145 FIX: Use toFixed(3) to match calculations exactly
              const displayValue = res.toFixed(3);

              return (
                <div key={dim} className="flex flex-col gap-1.5">
                  <label className="text-[9px] sm:text-[10px] lg:text-[9px] font-black text-gray-400 uppercase tracking-wider text-center line-clamp-1">
                    {dim === 'length' ? 'Length (X)' : dim === 'width' ? 'Width (Z)' : 'Height (Y)'}
                  </label>

                  {resizeMode === "manual" ? (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setDimensionInputs((p: any) => ({ ...p, [dim]: e.target.value }))}
                      className="w-full px-1 py-2 sm:py-2.5 lg:py-1.5 border border-gray-300 rounded-lg text-center text-sm sm:text-base lg:text-sm font-semibold shadow-inner bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <div className="bg-gray-100 border border-gray-200 rounded-lg py-2 sm:py-2.5 lg:py-2 px-1 sm:px-3 lg:px-1 text-center text-xs sm:text-sm lg:text-xs font-medium text-gray-700 truncate">
                      {displayValue}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>


        <div className="flex flex-col gap-2.5 sm:gap-4 lg:gap-2 mt-auto">
          {usageStats && !isSuperAdmin && (
            <div className="w-full bg-white/50 p-3 sm:p-4 lg:p-2 rounded-lg border border-white/80 shadow-sm mb-2">
              <div className="grid grid-cols-1 min-[400px]:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-x-2 gap-y-2 lg:gap-y-1">
                <div className="flex flex-col items-center min-[400px]:border-r lg:border-r-0 xl:border-r border-gray-200/60 pr-1 pb-2 min-[400px]:pb-0 lg:pb-1 xl:pb-0 border-b min-[400px]:border-b-0 lg:border-b xl:border-b-0">
                  <span className={`text-[10px] sm:text-xs lg:text-[9px] font-bold ${usageStats.uploads >= usageStats.maxUploads ? "text-red-500" : "text-gray-500"}`}>
                    Uploads: {Math.min(usageStats.uploads, usageStats.maxUploads)} / {usageStats.maxUploads === 999999 ? '∞' : usageStats.maxUploads}
                  </span>
                  <span className="text-[9px] sm:text-[10px] lg:text-[8px] font-bold text-gray-400 opacity-80 mt-0.5">
                    {usageStats.tier === "PAID" ? "Premium" : "(Total)"}
                  </span>
                </div>

                <div className="flex flex-col items-center min-[400px]:border-r lg:border-r-0 xl:border-r border-gray-200/60 pr-1 pb-2 min-[400px]:pb-0 lg:pb-1 xl:pb-0 border-b min-[400px]:border-b-0 lg:border-b xl:border-b-0">
                  <span className={`text-[10px] sm:text-xs lg:text-[9px] font-bold ${usageStats.rescales >= usageStats.maxRescales ? "text-red-500" : "text-gray-500"}`}>
                    Rescales: {Math.min(usageStats.rescales, usageStats.maxRescales)} / {usageStats.maxRescales === 999999 ? '∞' : usageStats.maxRescales}
                  </span>
                  <span className={`text-[9px] sm:text-[10px] lg:text-[8px] font-bold opacity-80 mt-0.5 ${usageStats.rescalesMonth >= usageStats.maxRescalesMonth ? "text-red-500" : "text-blue-500"}`}>
                    {usageStats.maxRescalesMonth ? `${Math.min(usageStats.rescalesMonth, usageStats.maxRescalesMonth)} / ${usageStats.maxRescalesMonth === 999999 ? '∞' : usageStats.maxRescalesMonth} (Mo)` : '(Daily)'}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <span className={`text-[10px] sm:text-xs lg:text-[9px] font-bold ${usageStats.usdz >= usageStats.maxUsdz ? "text-red-500" : "text-gray-500"}`}>
                    USDZ: {Math.min(usageStats.usdz, usageStats.maxUsdz)} / {usageStats.maxUsdz === 999999 ? '∞' : usageStats.maxUsdz}
                  </span>
                  <span className={`text-[9px] sm:text-[10px] lg:text-[8px] font-bold opacity-80 mt-0.5 ${usageStats.usdzMonth >= usageStats.maxUsdzMonth ? "text-red-500" : "text-purple-500"}`}>
                    {usageStats.tier === "PAID" ? "Unlimited" : usageStats.maxUsdzMonth ? `${Math.min(usageStats.usdzMonth, usageStats.maxUsdzMonth)} / ${usageStats.maxUsdzMonth === 999999 ? '∞' : usageStats.maxUsdzMonth} (Mo)` : '(Daily)'}
                  </span>
                </div>
              </div>
              {usageStats.historyDownloads !== undefined && (
                <div className="mt-2 pt-2 lg:mt-1 lg:pt-1 border-t border-gray-200/60 flex justify-center">
                  <span className="text-[9px] sm:text-[10px] lg:text-[8px] font-bold text-indigo-500">
                    History Downloads: {usageStats.historyDownloads} / {usageStats.maxHistoryDownloads}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3 w-full">
            <button
              onClick={() => {
                if (canRescale()) handleApply();
                else {
                  if (usageStats?.tier === "SAMPLE") triggerUpgrade(`Sample limit reached (${usageStats.maxRescales}/day).`);
                  else if (isGuest) triggerUpgrade(`Guest limit reached (${usageStats.maxRescales}/day). Please sign in!`);
                  else triggerUpgrade(`Rescale limit reached (${usageStats.maxRescales}/day or ${usageStats.maxRescalesMonth}/month).`);
                }
              }}
              disabled={isResizing || !glbFileKey}
              /* FIX: Changed flex-[2] to flex-1 and added w-full */
              className="flex-1 w-full py-3.5 sm:py-4 lg:py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium text-sm sm:text-base lg:text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5 "
            >
              Apply Changes
            </button>
            <button
              onClick={handleReset}
              /* FIX: Added w-full to match the other button */
              className="flex-1 w-full py-3.5 sm:py-4 lg:py-3.5 rounded-xl border border-amber-200 text-amber-600 font-medium text-sm sm:text-base lg:text-sm flex items-center justify-center gap-2 transition-all hover:bg-amber-50 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-4 lg:h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 14l5-5-5-5" />
                <path d="M9 14l5-5-5-5" />
                <path d="M3 20c0-6 3-11 11-11" />
              </svg>
              {/* FIX: Removed the sm:hidden classes so "Reset" is always visible */}
              <span>Reset</span>
            </button>
          </div>

          {!isSampleModel && (
            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3 w-full">
              <button
                onClick={() => handleDownload(toProxied(glbFile)!, "model.glb")}
                disabled={!glbFile}
                className="flex-1 w-full py-3.5 sm:py-4 lg:py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium text-sm sm:text-base lg:text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-3.5 lg:h-3.5" />
                GLB
              </button>

              <button
                onClick={() => handleDownload(toProxied(glbFile)!, "model_optimized.glb", true)}
                disabled={!glbFile}
                className="flex-1 w-full py-3.5 sm:py-4 lg:py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-sm sm:text-base lg:text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-3.5 lg:h-3.5" />
                Optimize & Download
              </button>
            </div>
          )}

          <button
            onClick={() => {
              if (canConvertUSDZ()) handleConvert();
              else {
                if (usageStats?.tier === "SAMPLE") triggerUpgrade(`Sample limit reached (${usageStats.maxUsdz}/day).`);
                else if (isGuest) triggerUpgrade(`Guest limit reached (${usageStats.maxUsdz} USDZ). Please sign in!`);
                else triggerUpgrade(`USDZ limit reached (${usageStats.maxUsdz}/day or ${usageStats.maxUsdzMonth}/month).`);
              }
            }}
            className="w-full py-4 sm:py-4 lg:py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white font-semibold text-sm sm:text-base lg:text-sm flex items-center justify-center gap-3 shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5 mt-1"
          >
            <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-4 lg:h-4" /> Convert to USDZ
          </button>

          {convertedUsdzUrl && (
            <div className="flex flex-col items-center justify-center gap-2 p-3 bg-white/60 rounded-xl mt-3 shadow-sm border border-white/80 animate-in fade-in zoom-in-95 duration-300">
              <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest text-center">Scan for iOS AR Quick Look</span>
              {shortId && <QRCodeSVG value={`http://${window.location.host}/ar-view?id=${shortId}`} size={110} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}