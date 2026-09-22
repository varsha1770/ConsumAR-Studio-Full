"use client";
import StudioHeader from "@/components/StudioHeader";
import Link from "next/link";

/**
 * THE LEGAL SHIELD: A DPDP-compliant privacy documentation page.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <StudioHeader />

      <main className="container mx-auto mt-10 md:mt-14 mb-16 md:mb-20 max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 mb-2 sm:mb-3">
          Privacy & Data Policy
        </h1>
        <p className="text-slate-500 uppercase tracking-wider text-[11px] sm:text-xs font-semibold mb-8 md:mb-10">
          Last Updated: April 2026 • DPDP Compliant
        </p>

        {/* Sections */}
        <section className="space-y-8 md:space-y-10 text-sm sm:text-base text-slate-700 leading-relaxed">
          {/* 1. Data Transparency */}
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 border-l-4 border-indigo-600 pl-3 md:pl-4 mb-3">
              1. Data Transparency (The "Rules")
            </h2>
            <p>
              In accordance with the <strong>Digital Personal Data Protection (DPDP) Act</strong>, ConsumAR Studio is committed to full transparency.
              When you sign in using Google, we collect only the essential information required to provide our service:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-2 sm:ml-4">
              <li><strong>Name:</strong> To personalize your dashboard.</li>
              <li><strong>Email:</strong> To uniquely identify your projects and send security notifications.</li>
              <li><strong>Profile Picture:</strong> To identify your session status.</li>
            </ul>
            <p className="mt-3">
              We call this the <strong>"Texture Identity Lock"</strong>. This ensures that your 3D models and resizes are locked to your specific account and cannot be accessed by others.
            </p>
          </div>

          {/* 2. History Log */}
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 border-l-4 border-indigo-600 pl-3 md:pl-4 mb-3">
              2. The History Log
            </h2>
            <p>
              We maintain a record of your activities (uploads, conversions, and resizes) for your convenience.
              This "History" is private to you and allows you to download or review your past work at any time via your Dashboard.
            </p>
          </div>

          {/* 3. Right to be Forgotten */}
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 border-l-4 border-indigo-600 pl-3 md:pl-4 mb-3">
              3. The Right to be Forgotten
            </h2>
            <p>
              We respect your right to leave and take your data with you. At any time, you can trigger the <strong>Self-Destruct</strong> sequence from your Dashboard.
              When you click "Delete Account":
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-2 sm:ml-4">
              <li>Your personal profile is wiped from our database.</li>
              <li>Every 3D model (GLB/USDZ) associated with your account is deleted from our file servers.</li>
              <li>You will receive a <strong>"Goodbye" email</strong> as legal proof that your data has been wiped.</li>
            </ul>
          </div>

          {/* 4. Fresh Start Policy */}
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 border-l-4 border-indigo-600 pl-3 md:pl-4 mb-3">
              4. Fresh Start Policy
            </h2>
            <p>
              If you decide to return to ConsumAR Studio after deleting your account, you will be treated as a <strong>brand new user</strong>.
              Your old history is gone forever and cannot be recovered. This ensures that no "ghost data" of your past work remains in our system.
            </p>
          </div>

          {/* Questions Box */}
          <div className="bg-indigo-50 p-5 sm:p-6 md:p-8 rounded-xl border border-indigo-100">
            <h3 className="text-base sm:text-lg font-bold text-indigo-900 mb-2">Have Questions?</h3>
            <p className="text-indigo-800 text-xs sm:text-sm">
              Our privacy officers are available to discuss our data handling practices. Contact our lead at Tryitfirst Labs for more information.
            </p>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-12 md:mt-16 pt-6 md:pt-8 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-between items-center gap-5 text-xs text-slate-500">
          <span className="text-center sm:text-left">&copy; 2026 Tryitfirst Labs. All Rights Reserved.</span>
          <Link
            href="/studio"
            className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors px-5 py-2 sm:p-0 bg-indigo-50 sm:bg-transparent rounded-full sm:rounded-none"
          >
            Back to Studio
          </Link>
        </div>
      </main>

    </div>
  );
}
