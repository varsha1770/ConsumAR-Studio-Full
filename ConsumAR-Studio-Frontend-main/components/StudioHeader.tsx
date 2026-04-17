"use client";
import Image from "next/image";

export default function StudioHeader() {
  return (
    <header className="bg-white shadow-md border-b border-gray-100">
        <div className="container mx-auto px-3 sm:px-5 md:px-6 py-1.5 sm:py-2 max-w-7xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Image
              src="/TIFLabs-main.png"
              alt="TIFLabs Main"
              width={400}
              height={120}
              unoptimized
                className="h-3 sm:h-4 md:h-5 lg:h-6 w-auto"
            />
          </div>
          
          <div className="flex-1 flex justify-center">
            <div className="text-center">
              <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Tryitfirst Studio</h1>
              <p className="text-xs text-gray-600 hidden sm:block">3D Model Generator & Editor</p>
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-2 flex-1">
            <span className="text-s font-regular text-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 px-2 sm:px-2.5 py-1 rounded-lg hidden sm:inline-block">Tryitfirst Labs</span>
          </div>
        </div>
      </div>
    </header>
  );
}
