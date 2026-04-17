"use client";
import { useState } from "react";
import GenerateModal from "./GenerateModal";
import { SparklesIcon } from "@heroicons/react/24/solid";

export default function GenerateSection() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg p-3 border border-gray-100">
        <div className="flex items-center gap-2 mb-3 bg-gradient-to-r from-purple-50 to-blue-50 p-2 rounded-lg">
          <div className="p-1.5 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-md">
            <SparklesIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">3D Model Generator</h2>
            <p className="text-xs text-gray-600">
              Upload photos to automatically generate, view, resize and download the 3D model.
            </p>
          </div>
        </div>

        <div className="text-center py-12">
          <button
            onClick={() => setShowModal(true)}
            className="px-8 py-4 text-base bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5" />
              <span>Start Generating</span>
            </div>
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Upload multiple images to create a 3D model with our engine
          </p>
        </div>
      </div>

      {showModal && <GenerateModal onClose={() => setShowModal(false)} />}
    </>
  );
}
