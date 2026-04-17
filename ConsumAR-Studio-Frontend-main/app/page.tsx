"use client";
import { useEffect, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import UploadSection from "@/components/UploadSection";
import GenerateSection from "@/components/GenerateSection";
import { Toaster } from "react-hot-toast";

export default function StudioPage() {
  useEffect(() => {
    // Initialize Model Viewer
    import("@google/model-viewer")
      .then(({ ModelViewerElement }) => {
        customElements.get("model-viewer") ||
          customElements.define("model-viewer", ModelViewerElement);
      })
      .catch((error) => {
        console.error("Error loading Model Viewer", error);
      });
  }, []);

  const [activeTab, setActiveTab] = useState<"upload" | "generate">("upload");

  return (
    <main className="h-screen overflow-auto bg-gradient-to-br from-blue-100 via-purple-100 to-blue-100">
      <Toaster position="top-center" />
      <StudioHeader />
      
      <div className="container mx-auto px-3 sm:px-5 md:px-6 py-1.5 sm:py-2 max-w-7xl">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-2 bg-white rounded-xl shadow-sm p-1 w-full sm:w-fit">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 sm:flex-none px-5 py-2 sm:py-1.5 text-sm font-semibold rounded-lg transition-all duration-300 ${
              activeTab === "upload"
                ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            3D Model Editor
          </button>
          <button
            onClick={() => setActiveTab("generate")}
            className={`flex-1 sm:flex-none px-5 py-2 sm:py-1.5 text-sm font-semibold rounded-lg transition-all duration-300 ${
              activeTab === "generate"
                ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md"
                : "text-  gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            3D Model Generator
          </button>
        </div>

        {/* Content */}
        <div className="relative">
          <div
            className={`transition-all duration-500 ${
              activeTab === "upload"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 absolute inset-0 pointer-events-none"
            }`}
          >
            <UploadSection />
          </div>
          <div
            className={`transition-all duration-500 ${
              activeTab === "generate"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 absolute inset-0 pointer-events-none"
            }`}
          >
            <GenerateSection />
          </div>
        </div>
      </div>
    </main>
  );
}