"use client";
import { useState } from "react";

const faqs = [
  {
    q: "Why scale 3D models?",
    a: "Scaling 3D models is essential for 3D printing, manufacturing, game development, and architectural visualization. You might need to resize models to fit specific dimensions, prepare them for different output devices, or adjust them for real-world applications where precise measurements matter."
  },
  {
    q: "When should I use the model scaling tool?",
    a: "Use this tool when preparing models for 3D printing at specific sizes, creating miniatures or large-scale replicas, adjusting models for game engines with different unit systems, or when you need precise dimensional control for manufacturing, prototyping, or architectural projects."
  },
  {
    q: "What scaling methods are available?",
    a: "Our tool offers two scaling methods: Multiplier scaling (scale by a factor like 2x or 0.5x) and Dimensional scaling (set exact measurements in centimeters or inches). Both methods support uniform scaling or independent axis scaling for maximum flexibility."
  },
  {
    q: "What does 'Lock Aspect Ratio' do?",
    a: "When 'Lock Aspect Ratio' is enabled, changing one dimension automatically adjusts the others proportionally, maintaining the model's original shape. Disable it if you need to stretch or compress the model along specific axes, though this may distort the appearance."
  },
  {
    q: "What file formats can be scaled?",
    a: "Our scaling tool supports GLB, GLTF, OBJ, STL, PLY, and USDZ formats. The scaled model is output in the same format as the input, preserving all materials, textures, and other properties while applying the new dimensions."
  },
  {
    q: "How do I use this conversion tool?",
    a: "Simply click 'Select File' or drag and drop your file into the upload area. The conversion will start automatically and you'll be able to download the converted file once it's complete."
  },
  {
    q: "What's the maximum file size I can convert?",
    a: "You can upload files up to 100MB in size. For most 3D models, this is more than sufficient. If you need to process larger files, please contact us for assistance."
  },
  {
    q: "Will converting my file reduce its quality?",
    a: "Our conversion tools are designed to preserve quality as much as possible. However, some formats may have different capabilities. We use industry-standard algorithms to ensure minimal quality loss during conversion."
  },
  {
    q: "How long does the conversion take?",
    a: "Processing time depends on file size and complexity. Most files are converted within 30 seconds to 2 minutes. Larger or more complex models may take longer."
  },
  {
    q: "Is this conversion tool free to use?",
    a: "Yes! This tool is completely free to use with no hidden fees, subscriptions, or limitations. You can convert as many files as you need without any cost."
  },
  {
    q: "Is my data safe and private?",
    a: "Absolutely. We take privacy seriously. Your uploaded files are processed securely and automatically deleted from our servers after conversion. We never store or share your files."
  }
];

export default function FaqSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="mt-24 w-full max-w-4xl mx-auto px-4 pb-48 flex flex-col items-center animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-1000">
      <div className="text-center mb-16">
        <h2 className="text-3xl font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
        <p className="text-gray-400 text-lg font-light">Find answers to common questions about this tool.</p>
      </div>

      <div className="space-y-5 w-full">
        {faqs.map((faq, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md w-full">
            <button 
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              className="w-full px-6 py-5 flex items-center justify-between text-left group"
            >
              <span className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{faq.q}</span>
              <div className={`transform transition-transform duration-300 ${openFaq === idx ? "rotate-180" : ""}`}>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </button>
            <div 
              className={`overflow-hidden transition-all duration-[400ms] ease-in-out ${openFaq === idx ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="px-6 pb-6 pt-2 border-t border-gray-50">
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                  {faq.a}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
