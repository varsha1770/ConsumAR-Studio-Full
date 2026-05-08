"use client";
import { MinusIcon, PlusIcon, ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/solid";

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
  handleConvert: () => void;
  handleRemoveWatermark: () => void;
  toProxied: (url: string | null) => string | null;
  triggerUpgrade: (msg?: string) => void;
  originalDimensions: any;
  originalDimensionUnit: string | null;
  rawModelDimensions: any;
  forceWatermark: boolean;
  setForceWatermark: (val: boolean) => void;
  watermarkText: string;
  setWatermarkText: (val: string) => void;
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
  handleRemoveWatermark,
  toProxied,
  triggerUpgrade,
  originalDimensions,
  originalDimensionUnit,
  rawModelDimensions,
  forceWatermark,
  setForceWatermark,
  watermarkText,
  setWatermarkText
}: EditorControlsProps) {
  // --- Tier Logic Constants ---
  const isPaid = userTier === "PAID" || isSuperAdmin;
  const isLogged = userTier === "FREE";
  const isGuest = userTier === "NON_LOGGED";

  // --- Feature Gating Logic ---
  const canRescale = () => {
    if (isPaid) return true;
    if (!usageStats) return false;
    if (isGuest) return usageStats.rescales < 2; // 2/day for Guest
    if (isLogged) return usageStats.rescales < 3 && usageStats.rescalesMonth < 60; // 3/day, 60/month
    return false;
  };

  const canConvertUSDZ = () => {
    if (isPaid) return true;
    if (!usageStats) return false;
    if (isGuest) return usageStats.usdz < 1; // 1 product total for Guest
    if (isLogged) return usageStats.usdz < 2 && usageStats.usdzMonth < 15; // 2/day, 15/month
    return false;
  };

  return (
    <div className="w-full lg:w-[350px] flex flex-col space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold tracking-widest uppercase text-indigo-500">Edit Dimensions</h3>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-indigo-100 via-purple-100 to-transparent"></div>
      </div>
      <div className="flex-1 flex flex-col gap-4 p-4 glass-morphism rounded-2xl">
        <div className="flex p-1 bg-white/50 backdrop-blur-sm rounded-xl border border-white/60">
          <button onClick={() => setResizeMode("manual")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${resizeMode === "manual" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Manual</button>
          <button onClick={() => setResizeMode("scale")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${resizeMode === "scale" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Scale</button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Units</label>
          <select value={dimensionUnit} onChange={(e) => handleUnitChange(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white text-sm">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-700">Scale Factor</label>
            <div className="flex items-center gap-1">
              <button onClick={decrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><MinusIcon className="w-3 h-3" /></button>
              <input type="text" value={scaleValue} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setScaleValue(e.target.value)} className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold shadow-inner" placeholder="1.0" />
              <button onClick={incrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><PlusIcon className="w-3 h-3" /></button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Target Dimensions</label>
          <div className="grid grid-cols-3 gap-2">
            {["length", "width", "height"].map(dim => {
              const val = dimensionInputs[dim as keyof typeof dimensionInputs];
              const s = parseFloat(scaleValue) || 1.0;
              const toMm: Record<string, number> = { millimeters: 1, centimeters: 10, inches: 25.4, feet: 304.8, meters: 1000 };

              const origVal = parseFloat(originalDimensions?.[dim]) || 0;

              // V176: Normalization Fix. If unit is 'meters' but value is > 10, it's almost certainly CM.
              let actualOrigUnit = originalDimensionUnit || "meters";
              if (actualOrigUnit === "meters" && origVal > 10) {
                actualOrigUnit = "centimeters";
              }

              const valInMm = origVal * (toMm[actualOrigUnit] || 1000);
              const targetFactor = 1 / (toMm[dimensionUnit] || 1000);
              const rawVal = valInMm * targetFactor;

              const res = resizeMode === "scale" ? (isNaN(rawVal) ? 0 : rawVal * s) : (parseFloat(val) || 0);

              // V145 FIX: Use toFixed(3) to match calculations exactly
              const displayValue = res.toFixed(3);

              return (
                <div key={dim} className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">
                    {dim === 'length' ? 'LENGTH (X)' : dim === 'width' ? 'WIDTH (Z)' : 'HEIGHT (Y)'}
                  </label>

                  {resizeMode === "manual" ? (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setDimensionInputs((p: any) => ({ ...p, [dim]: e.target.value }))}
                      className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold shadow-inner bg-white"
                    />
                  ) : (
                    <div className="bg-gray-100 border border-gray-200 rounded-lg py-2 px-3 text-center text-sm font-medium text-gray-700">
                      {displayValue}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-indigo-600 uppercase">Admin Tool</span>
              <span className="text-xs font-semibold text-indigo-900">Preview Branding</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={forceWatermark}
                onChange={(e) => {
                  setForceWatermark(e.target.checked);
                  // V129: Auto-Apply Branding on Toggle (Direct Override)
                  setTimeout(() => handleApply(e.target.checked), 100);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        )}

        {isSuperAdmin && forceWatermark && (
          <div className="mt-2 p-3 bg-white rounded-xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-2">
            <span className="text-[10px] font-black text-indigo-400 uppercase block mb-1">Watermark Text</span>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              onBlur={() => handleApply(true)}
              className="w-full px-3 py-2 text-xs font-bold text-indigo-900 bg-indigo-50/30 border border-indigo-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="Enter watermark text..."
            />
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto">
          {usageStats && !isSuperAdmin && (
            <div className="w-full bg-white/50 p-2 rounded-lg border border-white/80 shadow-sm mb-2">
              <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                <div className="flex flex-col items-center border-r border-gray-100/50 pr-1">
                  <span className={`text-[9px] font-bold ${usageStats.uploads >= usageStats.maxUploads ? "text-red-500" : "text-gray-500"}`}>
                    Uploads: {Math.min(usageStats.uploads, usageStats.maxUploads)} / {usageStats.maxUploads === 999999 ? '∞' : usageStats.maxUploads}
                  </span>
                  <span className="text-[8px] font-bold text-gray-400 opacity-80">
                    {usageStats.tier === "PAID" ? "Premium" : `${Math.min(usageStats.uploadsMonth, usageStats.maxUploadsMonth)} / ${usageStats.maxUploadsMonth === 999999 ? '∞' : usageStats.maxUploadsMonth} (Month)`}
                  </span>
                </div>

                <div className="flex flex-col items-center border-r border-gray-100/50 pr-1">
                  <span className={`text-[9px] font-bold ${usageStats.rescales >= usageStats.maxRescales ? "text-red-500" : "text-gray-500"}`}>
                    Rescales: {Math.min(usageStats.rescales, usageStats.maxRescales)} / {usageStats.maxRescales === 999999 ? '∞' : usageStats.maxRescales}
                  </span>
                  <span className={`text-[8px] font-bold opacity-80 ${usageStats.rescalesMonth >= usageStats.maxRescalesMonth ? "text-red-500" : "text-blue-500"}`}>
                    {Math.min(usageStats.rescalesMonth, usageStats.maxRescalesMonth)} / {usageStats.maxRescalesMonth === 999999 ? '∞' : usageStats.maxRescalesMonth} (Month)
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <span className={`text-[9px] font-bold ${usageStats.usdz >= usageStats.maxUsdz ? "text-red-500" : "text-gray-500"}`}>
                    USDZ: {Math.min(usageStats.usdz, usageStats.maxUsdz)} / {usageStats.maxUsdz === 999999 ? '∞' : usageStats.maxUsdz}
                  </span>
                  <span className={`text-[8px] font-bold opacity-80 ${usageStats.usdzMonth >= usageStats.maxUsdzMonth ? "text-red-500" : "text-purple-500"}`}>
                    {usageStats.tier === "PAID" ? "Unlimited" : `${Math.min(usageStats.usdzMonth, usageStats.maxUsdzMonth)} / ${usageStats.maxUsdzMonth === 999999 ? '∞' : usageStats.maxUsdzMonth} (Month)`}
                  </span>
                </div>
              </div>
              {usageStats.historyDownloads !== undefined && (
                <div className="mt-1 pt-1 border-t border-gray-100 flex justify-center">
                   <span className="text-[8px] font-bold text-indigo-500">
                     History Downloads: {usageStats.historyDownloads} / {usageStats.maxHistoryDownloads}
                   </span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button 
              onClick={() => {
                if (canRescale()) handleApply();
                else triggerUpgrade(isGuest ? "Guest limit reached (2/day). Please sign in!" : "Rescale limit reached (3/day or 60/month).");
              }} 
              disabled={isResizing || !glbFileKey} 
              className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5"
            >
              Apply Changes
            </button>
            <button onClick={handleReset} className="px-5 py-3.5 rounded-xl border border-amber-200 text-amber-600 font-medium text-sm flex items-center justify-center gap-2 transition-all hover:bg-amber-50 active:scale-[0.98]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 14l5-5-5-5" />
                <path d="M9 14l5-5-5-5" />
                <path d="M3 20c0-6 3-11 11-11" />
              </svg>
              Reset
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleDownload(toProxied(glbFile)!, "model.glb")} disabled={!glbFile} className="flex-1 py-3 rounded-xl bg-white border border-gray-200 text-gray-600 font-medium text-xs flex items-center justify-center gap-2 transition-all hover:bg-gray-50">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> GLB
            </button>
            <button onClick={() => handleDownload(toProxied(glbFile)!, "model.glb", true)} disabled={!glbFile} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5">
              <ArrowDownTrayIcon className="w-4 h-4" /> Optimize & Download
            </button>
          </div>

          {/* V146: Premium Remove Watermark Button */}
          <button 
            onClick={handleRemoveWatermark}
            disabled={isResizing || !glbFile}
            className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2 shadow-lg ${
              isPaid 
                ? "bg-white border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 shadow-red-100/30" 
                : "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed grayscale"
            }`}
          >
            {isPaid ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Remove Watermark
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                Remove Watermark (Premium)
              </span>
            )}
          </button>
          <button 
            onClick={() => {
              if (canConvertUSDZ()) handleConvert();
              else triggerUpgrade(isGuest ? "Guest limit reached (1 USDZ). Please sign in!" : "USDZ limit reached (2/day or 15/month).");
            }} 
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white font-semibold text-sm flex items-center justify-center gap-3 shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5"
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> Convert to USDZ
          </button>
        </div>
      </div>
    </div>
  );
}