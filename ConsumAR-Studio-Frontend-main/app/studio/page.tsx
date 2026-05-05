"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StudioHeader from "@/components/StudioHeader";
import UploadSection from "@/components/UploadSection";
import GenerateSection from "@/components/GenerateSection";
import Pricing from "@/components/Pricing";
import { Toaster } from "react-hot-toast";

export default function StudioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab] = useState<"upload">("upload");

  // Removed the SECURITY FAILSAFE redirect because /studio is now explicitly a public page
  // for the anonymous 'try-before-you-buy' teaser.

  // Prevent flicker while checking auth, but allow unauthenticated to render the teaser
  if (status === "loading") {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 font-serif">
        <div className="text-xl animate-pulse text-indigo-700">Loading Studio...</div>
      </div>
    );
  }

  return (
    <main className="h-screen overflow-auto no-scrollbar bg-gradient-to-br from-blue-100 via-purple-100 to-blue-100">
      <Toaster position="top-center" />
      <StudioHeader />
      
      <div className="container mx-auto px-3 sm:px-5 md:px-6 py-1.5 sm:py-2 max-w-7xl">

        <div className="relative">
          <UploadSection />
        </div>

        <Pricing />
      </div>
    </main>
  );
}
