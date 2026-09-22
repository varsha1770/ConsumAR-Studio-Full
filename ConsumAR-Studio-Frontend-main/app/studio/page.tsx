"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StudioHeader from "@/components/StudioHeader";
import UploadSection from "@/components/UploadSection";
import GenerateSection from "@/components/GenerateSection";
import Pricing from "@/components/Pricing";
import UserCommentSection from "@/components/UserCommentSection";
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
    <main className="h-[100dvh] overflow-auto no-scrollbar bg-gradient-to-br from-blue-100 via-purple-100 to-blue-100">
      <Toaster position="top-center" />
      <StudioHeader />

      {/* Adjusted padding for better breathing room and added a flex-col layout to manage spacing between sections */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex flex-col gap-10 md:gap-16">

        <div className="relative w-full">
          <UploadSection />
        </div>

        <div className="w-full">
          <Pricing />
        </div>

        {/* USER COMMENT & COMMUNITY FEEDBACK SECTION ABOVE FOOTER */}
        <div className="w-full pb-16">
          <UserCommentSection />
        </div>

      </div>
    </main>
  );
}
