"use client";
import ManualUpload from "./ManualUpload";

interface HeroSectionProps {
  glbFile: string | null;
  glbFileName: string | null;
  handleGLBUpload: (fileUrl: string, fileKey: string, fileName: string, fileBlobUrl?: string) => void;
  userTier: string;
  isOverUploadLimit?: boolean;
}

export default function HeroSection({ glbFile, glbFileName, handleGLBUpload, userTier, isOverUploadLimit }: HeroSectionProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 py-12 animate-in fade-in zoom-in-95 duration-1000 ease-out">
      {/* DECORATIVE BACKGROUND BLURS */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-300/10 rounded-full blur-[120px] -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-300/10 rounded-full blur-[140px] -z-10 animate-pulse delay-700"></div>

      <div className="w-full max-w-3xl glass-card rounded-[2rem] p-6 sm:p-8 relative overflow-hidden group">
        {/* Subtle Inner Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none"></div>

        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-3">
            ConsumAR <span className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">Studio</span>
          </h1>
          <p className="text-gray-400 text-sm font-light max-w-xs leading-relaxed">
            Transform your raw models into <br/>
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
        />

        <div className="mt-6 pt-6 border-t border-gray-100/50 flex justify-center gap-8 opacity-80">
           <div className="flex flex-col items-center gap-1 group/item cursor-default">
              <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-blue-500/70">Industry Standard</span>
              <div className="font-medium text-gray-500 text-[10px]">GLB / GLTF</div>
           </div>
           <div className="w-px h-6 bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
           <div className="flex flex-col items-center gap-1 group/item cursor-default">
              <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-purple-500/70">Output Format</span>
              <div className="font-medium text-gray-500 text-[10px]">USDZ AR</div>
           </div>
        </div>
      </div>

      {/* ABOUT SCALING SECTION */}
      <div className="mt-20 w-full max-w-4xl px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center sm:text-left">About 3D Model Scaling</h2>
        <div className="flex flex-col gap-6 text-gray-600 leading-relaxed font-medium text-sm sm:text-base">
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
      <div className="mt-20 w-full max-w-4xl px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center sm:text-left">How to Scale 3D Models</h2>
        <div className="space-y-8">
          {[
            { num: 1, text: "Upload your GLB file to the scaler. The tool displays current model dimensions and allows you to choose your preferred measurement units." },
            { num: 2, text: "Enter your desired dimensions or scale factor. Choose uniform scaling to maintain proportions or scale individual X, Y, Z axes independently for custom shapes." },
            { num: 3, text: "Preview the scaled model in real-time with the 3D viewer. Verify dimensions are correct before downloading. The tool shows both original and new sizes for comparison." },
            { num: 4, text: "Download your scaled GLB file with precise dimensions. The model is ready for 3D printing, AR applications, or any other use with exact measurements." }
          ].map((step) => (
            <div key={step.num} className="flex gap-4 items-start group">
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md group-hover:scale-110 transition-transform">
                {step.num}
              </div>
              <p className="text-gray-700 text-sm sm:text-base leading-relaxed pt-0.5">
                {step.text}
              </p>
            </div>
          ))}

          {/* TIP BOX */}
          <div className="mt-10 bg-blue-50/80 border border-blue-100 rounded-2xl p-6 flex gap-4 items-start shadow-sm transition-all hover:shadow-md">
            <span className="text-xl" role="img" aria-label="lightbulb">💡</span>
            <p className="text-sm text-blue-900 leading-relaxed">
              <span className="font-bold">Tip:</span> For 3D printing, scale to your printer's build volume. For AR, scale to real-world dimensions. 
              Use uniform scaling to maintain model proportions.
            </p>
          </div>
        </div>
      </div>
      
      {/* USE CASES SECTION */}
      <div className="mt-20 w-full max-w-4xl px-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-700 pb-20">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center sm:text-left">Common Use Cases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm transition-all hover:shadow-md hover:scale-[1.02]">
            <h3 className="text-lg font-bold text-blue-900 mb-3">3D Printing Preparation</h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              Scale models to fit your 3D printer's build volume. Adjust dimensions precisely for miniatures, prototypes, or full-size prints with accurate measurements.
            </p>
          </div>
          <div className="bg-green-50 border border-green-100 p-6 rounded-2xl shadow-sm transition-all hover:shadow-md hover:scale-[1.02]">
            <h3 className="text-lg font-bold text-green-900 mb-3">AR Visualization</h3>
            <p className="text-sm text-green-800 leading-relaxed">
              Resize models to real-world scale for augmented reality. Ensure furniture, products, or architectural elements appear at correct sizes in AR apps.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl shadow-sm transition-all hover:shadow-md hover:scale-[1.02]">
            <h3 className="text-lg font-bold text-purple-900 mb-3">Game Development</h3>
            <p className="text-sm text-purple-800 leading-relaxed">
              Scale assets to match your game's unit system. Resize characters, props, and environments to maintain consistent proportions across your project.
            </p>
          </div>
          <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl shadow-sm transition-all hover:shadow-md hover:scale-[1.02]">
            <h3 className="text-lg font-bold text-orange-900 mb-3">Architectural Models</h3>
            <p className="text-sm text-orange-800 leading-relaxed">
              Adjust building models to accurate real-world scale. Convert between different unit systems for international projects and precise visualization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
