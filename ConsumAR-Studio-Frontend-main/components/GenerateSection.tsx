"use client";
import { useState } from "react";
import GenerateModal from "./GenerateModal";
import { SparklesIcon } from "@heroicons/react/24/solid";

export default function GenerateSection() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {/* The container uses min-h-[60vh] to ensure it acts as a large, inviting dropzone on all screens */}
      <div className="flex flex-col items-center justify-center w-full h-full min-h-[60vh] md:min-h-[70vh] bg-white/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] shadow-xl shadow-indigo-100/50 border border-white p-6 sm:p-10 md:p-16 text-center relative overflow-hidden transition-all">

        {/* Soft background glow effect behind the text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-gradient-to-tr from-indigo-200/40 to-purple-200/40 blur-[80px] md:blur-[120px] rounded-full pointer-events-none -z-10"></div>

        <div className="flex flex-col items-center gap-4 sm:gap-6 mb-8 sm:mb-12 z-10">
          <div className="p-3 sm:p-4 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl sm:rounded-3xl shadow-lg shadow-indigo-200">
            <SparklesIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight pb-1">
              3D Model Generator
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-slate-500 font-medium max-w-xl md:max-w-2xl mx-auto mt-3 sm:mt-5 leading-relaxed px-2">
              Transform your standard photos into high-fidelity 3D assets. Upload multiple angles to automatically generate, resize, and export to GLB or USDZ.
            </p>
          </div>
        </div>

        <div className="z-10 w-full px-4 sm:px-0">
          <button
            onClick={() => setShowModal(true)}
            className="group relative w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 bg-slate-900 text-white font-bold text-sm sm:text-lg md:text-xl rounded-xl sm:rounded-[2rem] transition-all hover:bg-indigo-600 hover:shadow-2xl hover:shadow-indigo-500/30 active:scale-[0.98] overflow-hidden flex items-center justify-center gap-3 mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            <SparklesIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>Start Generating</span>
          </button>
          <p className="text-[10px] sm:text-xs md:text-sm text-slate-400 font-bold uppercase tracking-widest mt-6 sm:mt-8">
            Upload minimum 1, recommended 8 angles
          </p>
        </div>
      </div>

      {showModal && <GenerateModal onClose={() => setShowModal(false)} />}
    </>
  );
}
