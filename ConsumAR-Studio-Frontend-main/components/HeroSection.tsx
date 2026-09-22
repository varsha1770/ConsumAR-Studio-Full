"use client";
import { useState } from "react";
import ManualUpload from "./ManualUpload";
import GenerateModal from "./GenerateModal";

interface HeroSectionProps {
  glbFile: string | null;
  glbFileName: string | null;
  handleGLBUpload: (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => void;
  userTier: string;
  isOverUploadLimit?: boolean;
  setGlbFile: (url: string) => void;
}

export default function HeroSection({ glbFile, glbFileName, handleGLBUpload, userTier, isOverUploadLimit, setGlbFile }: HeroSectionProps) {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // ... rest of your existing code
  return (

    <div className="relative flex flex-col items-center justify-center min-h-[50vh] px-4 sm:px-6 md:px-8 pt-2 pb-6 sm:pt-4 sm:pb-8 md:pt-4 md:pb-10 animate-in fade-in zoom-in-95 duration-1000 ease-out overflow-hidden">
      {/* DECORATIVE BACKGROUND BLURS */}
      <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-72 sm:h-72 bg-blue-300/10 rounded-full blur-[80px] sm:blur-[120px] -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-56 h-56 sm:w-80 sm:h-80 bg-purple-300/10 rounded-full blur-[100px] sm:blur-[140px] -z-10 animate-pulse delay-700"></div>

      {/* Reduced max-w-3xl to max-w-2xl, and p-10 to p-6/p-8 to make the card more compact */}
      <div className="w-full max-w-2xl glass-card rounded-[1.5rem] sm:rounded-[2rem] px-3 py-[7px] sm:px-4 sm:py-[11px] md:px-6 md:py-[7px] relative overflow-hidden group">
        {/* Subtle Inner Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none"></div>

        {/* FIX: Reduced bottom margin separating title from the dropzone */}
        <div className="flex flex-col items-center text-center mb-3 sm:mb-4 relative z-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 mb-1 sm:mb-1.5">
            ConsumAR <span className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">Studio</span>
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm font-light max-w-[16rem] sm:max-w-xs leading-relaxed">
            Transform your raw models into <br className="hidden sm:block" />
            <span className="text-indigo-500 font-medium text-xs sm:text-sm">interactive AR experiences</span>.
          </p>
        </div>

        <ManualUpload
          onGLBUpload={handleGLBUpload}
          currentGlbUrl={glbFile}
          glbFileName={glbFileName}
          variant="landing"
          userTier={userTier}
          isOverUploadLimit={isOverUploadLimit}
          onGenerateClick={() => setShowGenerateModal(true)}
        />

        {/* FIX: Reduced margin-top and padding-top to pull the bottom text closer to the dropzone */}
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100/50 flex justify-center gap-4 sm:gap-8 opacity-80 z-10 relative">
          <div className="flex flex-col items-center gap-1 group/item cursor-default">
            <span className="text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.2em] text-blue-500/70 text-center">Industry Standard</span>
            <div className="font-medium text-gray-500 text-[9px] sm:text-[10px]">GLB / GLTF</div>
          </div>
          <div className="w-px h-6 sm:h-8 bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
          <div className="flex flex-col items-center gap-1 group/item cursor-default">
            <span className="text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.2em] text-purple-500/70 text-center">Output Format</span>
            <div className="font-medium text-gray-500 text-[9px] sm:text-[10px]">USDZ AR</div>
          </div>
        </div>
      </div>
      {/* SAMPLE MODELS ACCORDION */}
      <div className="w-full max-w-2xl mx-auto mt-[11px] sm:mt-[15px] z-10 relative animate-in fade-in slide-in-from-bottom-5 duration-700 delay-300">

        {/* Styled Header */}
        <button
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          className="w-full bg-white rounded-[1.25rem] sm:rounded-[1.5rem] shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100 px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.99] group"
        >
          <span className=" sm:text-lg md:text-xl bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
            Don't have a 3D model right now? Click a sample below to load it directly into the Studio.
          </span>

          {/* Animated Chevron */}
          <svg
            className={`w-5 h-5 sm:w-6 sm:h-6 text-slate-400 transition-transform duration-300 ease-in-out ${isAccordionOpen ? '-rotate-180' : 'rotate-0'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Accordion Body (Animated Height) */}
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${isAccordionOpen ? 'max-h-[800px] sm:max-h-[500px] opacity-100 mt-2 sm:mt-3' : 'max-h-0 opacity-0 mt-0'
            }`}
        >
          <div className="p-4 sm:p-5 bg-white/70 backdrop-blur-md rounded-[1.25rem] sm:rounded-[1.5rem] border border-gray-100 shadow-sm">

            {/* The 3 GLB Cards Grid - Stacks vertically on very small phones, side-by-side on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">

              {/* Sample 1 - Wooden Frame Sofa */}
              <button
                onClick={() => handleGLBUpload("/sample1.glb", "sample-model-1", "Wooden Frame Sofa.glb")}
                className="flex flex-row sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
                <div className="flex flex-col sm:items-center text-left sm:text-center">
                  <span className="text-sm sm:text-xs md:text-sm font-bold text-gray-700">Sample Model 1</span>
                  <span className="text-[10px] sm:text-[9px] md:text-[10px] text-gray-400 font-medium">Wooden Frame Sofa</span>
                </div>
              </button>

              {/* Sample 2 - Tufted 2-Seater Sofa */}
              <button
                onClick={() => handleGLBUpload("/sample2.glb", "sample-model-2", "Tufted Sofa.glb")}
                className="flex flex-row sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-100 hover:border-purple-300 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
                <div className="flex flex-col sm:items-center text-left sm:text-center">
                  <span className="text-sm sm:text-xs md:text-sm font-bold text-gray-700">Sample Model 2</span>
                  <span className="text-[10px] sm:text-[9px] md:text-[10px] text-gray-400 font-medium">Tufted 2-Seat Sofa</span>
                </div>
              </button>

              {/* Sample 3 - Accent Armchair */}
              <button
                onClick={() => handleGLBUpload("/sample3.glb", "sample-model-3", "Accent Armchair.glb")}
                className="flex flex-row sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-xl bg-white border border-gray-100 hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
                <div className="flex flex-col sm:items-center text-left sm:text-center">
                  <span className="text-sm sm:text-xs md:text-sm font-bold text-gray-700">Sample Model 3</span>
                  <span className="text-[10px] sm:text-[9px] md:text-[10px] text-gray-400 font-medium">Accent Armchair</span>
                </div>
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* ABOUT SCALING SECTION - Reduced mt-20 to mt-10 to pull it up into the viewport */}
      <div className="mt-10 md:mt-12 w-full max-w-4xl px-2 sm:px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4 sm:mb-5 text-center sm:text-left tracking-tight">About 3D Model Scaling</h2>
        <div className="flex flex-col gap-3 sm:gap-4 text-gray-600 leading-relaxed font-medium text-sm sm:text-base">
          <p>
            The 3D Model Scaler resizes GLB models with precision for any application. Whether you need to scale models for 3D printing,
            adjust dimensions for AR visualization, or resize assets for game development, this tool provides accurate scaling with
            unit conversion support including millimeters, centimeters, meters, inches, and feet.
          </p>
          <p>
            Our scaler maintains model proportions and quality while adjusting dimensions. Scale uniformly to preserve
            aspect ratios or scale individual axes for custom dimensions. Perfect for preparing models for 3D printing at specific sizes,
            adjusting architectural models to real-world scale, or resizing game assets to match your project requirements.
          </p>
        </div>
      </div>

      {/* HOW TO SCALE SECTION */}
      <div className="mt-12 md:mt-16 w-full max-w-4xl px-2 sm:px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-5 sm:mb-6 text-center sm:text-left tracking-tight">How to Scale 3D Models</h2>
        <div className="space-y-5 sm:space-y-6">
          {[
            { num: 1, text: "Upload your GLB file to the scaler. The tool displays current model dimensions and allows you to choose your preferred measurement units." },
            { num: 2, text: "Enter your desired dimensions or scale factor. Choose uniform scaling to maintain proportions or scale individual X, Y, Z axes independently for custom shapes." },
            { num: 3, text: "Preview the scaled model in real-time with the 3D viewer. Verify dimensions are correct before downloading. The tool shows both original and new sizes for comparison." },
            { num: 4, text: "Download your scaled GLB file with precise dimensions. The model is ready for 3D printing, AR applications, or any other use with exact measurements." }
          ].map((step) => (
            <div key={step.num} className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center sm:items-start group text-center sm:text-left">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md group-hover:scale-110 transition-transform">
                {step.num}
              </div>
              <p className="text-gray-700 text-sm sm:text-base leading-relaxed pt-0.5">
                {step.text}
              </p>
            </div>
          ))}

          {/* TIP BOX */}
          <div className="mt-6 sm:mt-8 bg-blue-50/80 border border-blue-100 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-4 items-center sm:items-start shadow-sm transition-all hover:shadow-md text-center sm:text-left">
            <span className="text-xl sm:text-2xl shrink-0" role="img" aria-label="lightbulb">💡</span>
            <p className="text-sm text-blue-900 leading-relaxed">
              <span className="font-bold block sm:inline mb-1 sm:mb-0">Tip:</span> For 3D printing, scale to your printer's build volume. For AR, scale to real-world dimensions.
              Use uniform scaling to maintain model proportions.
            </p>
          </div>
        </div>
      </div>

      {/* USE CASES SECTION */}
      <div className="mt-12 md:mt-16 w-full max-w-4xl px-2 sm:px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-700 pb-12 md:pb-16">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-5 sm:mb-6 text-center sm:text-left tracking-tight">Common Use Cases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <div className="bg-blue-50 border border-blue-100 p-4 sm:p-5 rounded-2xl shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
            <h3 className="text-base sm:text-lg font-bold text-blue-900 mb-2 sm:mb-2.5">3D Printing Preparation</h3>
            <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
              Scale models to fit your 3D printer's build volume. Adjust dimensions precisely for miniatures, prototypes, or full-size prints with accurate measurements.
            </p>
          </div>
          <div className="bg-green-50 border border-green-100 p-4 sm:p-5 rounded-2xl shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
            <h3 className="text-base sm:text-lg font-bold text-green-900 mb-2 sm:mb-2.5">AR Visualization</h3>
            <p className="text-xs sm:text-sm text-green-800 leading-relaxed">
              Resize models to real-world scale for augmented reality. Ensure furniture, products, or architectural elements appear at correct sizes in AR apps.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-100 p-4 sm:p-5 rounded-2xl shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
            <h3 className="text-base sm:text-lg font-bold text-purple-900 mb-2 sm:mb-2.5">Game Development</h3>
            <p className="text-xs sm:text-sm text-purple-800 leading-relaxed">
              Scale assets to match your game's unit system. Resize characters, props, and environments to maintain consistent proportions across your project.
            </p>
          </div>
          <div className="bg-orange-50 border border-orange-100 p-4 sm:p-5 rounded-2xl shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
            <h3 className="text-base sm:text-lg font-bold text-orange-900 mb-2 sm:mb-2.5">Architectural Models</h3>
            <p className="text-xs sm:text-sm text-orange-800 leading-relaxed">
              Adjust building models to accurate real-world scale. Convert between different unit systems for international projects and precise visualization.
            </p>
          </div>
        </div>
      </div>

      {showGenerateModal && <GenerateModal onClose={() => setShowGenerateModal(false)} />}
    </div>
  );
}
