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

      <main className="container mx-auto mt-12 mb-20 max-w-3xl px-6">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Privacy & Data Policy</h1>
        <p className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-10">Last Updated: April 2026 • DPDP Compliant</p>

        <section className="space-y-8 text-gray-700 leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-4 mb-4">1. Data Transparency (The "Rules")</h2>
            <p>
              In accordance with the <strong>Digital Personal Data Protection (DPDP) Act</strong>, ConsumAR Studio is committed to full transparency. 
              When you sign in using Google, we collect only the essential information required to provide our service:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 ml-4">
              <li><strong>Name:</strong> To personalize your dashboard.</li>
              <li><strong>Email:</strong> To unique identify your projects and send security notifications.</li>
              <li><strong>Profile Picture:</strong> To identify your session status.</li>
            </ul>
            <p className="mt-4">
              We call this the <strong>"Texture Identity Lock"</strong>. This ensure that your 3D models and resizes are locked to your specific account and cannot be accessed by others.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-4 mb-4">2. The History Log</h2>
            <p>
              We maintain a record of your activities (uploads, conversions, and resizes) for your convenience. 
              This "History" is private to you and allows you to download or review your past work at any time via your Dashboard.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-4 mb-4">3. The Right to be Forgotten</h2>
            <p>
              We respect your right to leave and take your data with you. At any time, you can trigger the <strong>Self-Destruct</strong> sequence from your Dashboard.
              When you click "Delete Account":
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 ml-4">
              <li>Your personal profile is wiped from our database.</li>
              <li>Every 3D model (GLB/USDZ) associated with your account is deleted from our file servers.</li>
              <li>You will receive a <strong>"Goodbye" email</strong> as legal proof that your data has been wiped.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-4 mb-4">4. Fresh Start Policy</h2>
            <p>
              If you decide to return to ConsumAR Studio after deleting your account, you will be treated as a <strong>brand new user</strong>.
              Your old history is gone forever and cannot be recovered. This ensures that no "ghost data" of your past work remains in our system.
            </p>
          </div>

          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
            <h3 className="text-lg font-bold text-indigo-900 mb-2">Have Questions?</h3>
            <p className="text-indigo-800 text-sm">
              Our privacy officers are available to discuss our data handling practices. Contact our lead at Tryitfirst Labs for more information.
            </p>
          </div>
        </section>

        <div className="mt-16 pt-8 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
          <span>&copy; 2026 Tryitfirst Labs. All Rights Reserved.</span>
          <Link href="/studio" className="font-bold text-indigo-600 hover:underline">Back to Studio</Link>
        </div>
      </main>
    </div>
  );
}
