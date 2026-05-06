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
            {["feet", "centimeters", "meters", "millimeters", "inches"].map(u => {
              let isLocked = false;
              if (userTier === "NON_LOGGED") {
                isLocked = u !== "centimeters";
              } else if (userTier === "FREE") {
                isLocked = ["meters", "millimeters", "inches"].includes(u);
              }
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
              <button onClick={decrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><MinusIcon className="w-3 h-3"/></button>
              <input type="text" value={scaleValue} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setScaleValue(e.target.value)} className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold shadow-inner" placeholder="1.0" />
              <button onClick={incrementScale} className="p-1.5 border border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 active:scale-95"><PlusIcon className="w-3 h-3"/></button>
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
                const origUnit = "meters"; 
                const valInMm = origVal * (toMm[origUnit] || 304.8);
                const targetFactor = 1 / (toMm[dimensionUnit] || 304.8);
                const rawVal = valInMm * targetFactor;
                
                const res = resizeMode === "scale" ? rawVal * s : parseFloat(val) || 0;

                return (
                  <div key={dim} className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">
                      {dim === 'length' ? 'LENGTH (X)' : dim === 'width' ? 'WIDTH (Z)' : 'HEIGHT (Y)'}
                    </label>
                    
                    {resizeMode === "manual" ? (
                      <input 
                        type="text" 
                        value={val} 
                        onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setDimensionInputs((p: any) => ({...p, [dim]: e.target.value}))} 
                        className="w-full px-1 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold shadow-inner bg-white" 
                      />
                    ) : (
                      <div className="bg-gray-100 border border-gray-200 rounded-lg py-2 px-3 text-center text-sm font-medium text-gray-700">
                        {res.toFixed(2)}
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
          {usageStats && userTier !== "PAID" && !isSuperAdmin && (
            <div className="w-full bg-white/50 p-2 rounded-lg border border-white/80 shadow-sm mb-2">
              <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                <div className="flex flex-col items-center border-r border-gray-100/50 pr-1">
                  <span className={`text-[9px] font-bold ${usageStats.uploads >= usageStats.maxUploads ? "text-red-500" : "text-gray-500"}`}>
                    Uploads: {Math.min(usageStats.uploads, usageStats.maxUploads)} / {usageStats.maxUploads === 999999 ? '∞' : usageStats.maxUploads}
                  </span>
                  <span className="text-[8px] font-bold text-gray-400 opacity-80">
                    {Math.min(usageStats.uploadsMonth, usageStats.maxUploadsMonth)} / {usageStats.maxUploadsMonth === 999999 ? '∞' : usageStats.maxUploadsMonth} (Month)
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
                    {Math.min(usageStats.usdzMonth, usageStats.maxUsdzMonth)} / {usageStats.maxUsdzMonth === 999999 ? '∞' : usageStats.maxUsdzMonth} (Month)
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => {
              if (!isSuperAdmin && usageStats && usageStats.rescales >= usageStats.maxRescales) {
                if (userTier === "NON_LOGGED") triggerUpgrade("You've used your 2 free guest rescales. Sign in to get 3 more!");
                else triggerUpgrade();
                return;
              }
              handleApply();
            }} disabled={isResizing || !glbFileKey} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5">Apply Changes</button>
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
            <button onClick={() => {
              if (!isSuperAdmin && (userTier === "NON_LOGGED" || userTier === "FREE")) {
                triggerUpgrade("Free and Guest users cannot download 3D models. Please upgrade to Pro to access GLB downloads.");
                return;
              }
              handleDownload(toProxied(glbFile)!, "model.glb");
            }} disabled={!glbFile} className="flex-1 py-3 rounded-xl bg-white border border-gray-200 text-gray-600 font-medium text-xs flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"><ArrowDownTrayIcon className="w-3.5 h-3.5" /> GLB</button>
            <button onClick={() => {
              if (!isSuperAdmin && (userTier === "NON_LOGGED" || userTier === "FREE")) {
                triggerUpgrade("Free and Guest users cannot download 3D models. Please upgrade to Pro to access GLB downloads.");
                return;
              }
              handleDownload(toProxied(glbFile)!, "model.glb", true);
            }} disabled={!glbFile} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5"><ArrowDownTrayIcon className="w-4 h-4" /> Optimize & Download</button>
          </div>
          <button onClick={() => {
              if (!isSuperAdmin && usageStats && usageStats.usdz >= usageStats.maxUsdz) {
                if (userTier === "NON_LOGGED") triggerUpgrade("You've used your 1 free guest conversion. Sign in to get more!");
                else triggerUpgrade();
                return;
              }
              handleConvert();
          }} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white font-semibold text-sm flex items-center justify-center gap-3 shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5"><ArrowDownTrayIcon className="w-4 h-4" /> Convert to USDZ</button>
        </div>
      </div>
    </div>
  );
}
