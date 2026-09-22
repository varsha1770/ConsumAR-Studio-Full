"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    const verifyToken = async () => {
      const result = await signIn("magic-link", {
        token,
        redirect: false,
      });

      if (result?.error) {
        setStatus("error");
      } else {
        toast.success("Successfully logged in!");
        router.push("/studio");
        router.refresh();
      }
    };

    verifyToken();
  }, [token, router]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-gray-50 p-4 sm:p-6">
      {status === "loading" ? (
        <div className="flex flex-col items-center justify-center space-y-4 sm:space-y-5 px-4 text-center">
          <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          <p className="text-base sm:text-lg font-medium text-gray-700 animate-pulse">Verifying your secure link...</p>
        </div>
      ) : (
        <div className="w-full max-w-[22rem] sm:max-w-md rounded-xl md:rounded-2xl bg-white p-6 sm:p-8 md:p-10 text-center shadow-xl shadow-gray-200/50 border border-gray-200 transition-all">

          {/* Icon wrapped in a soft background circle for better visual hierarchy */}
          <div className="mx-auto mb-5 sm:mb-6 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-red-50 border border-red-100">
            <svg className="h-7 w-7 sm:h-8 sm:w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h2 className="mb-2 sm:mb-3 text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            Link Expired or Invalid
          </h2>

          <p className="mb-6 sm:mb-8 text-sm sm:text-base text-gray-500 leading-relaxed px-2 sm:px-0">
            This magic link has expired or has already been used. Please request a new one.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 sm:py-2.5 text-sm sm:text-base font-semibold text-white transition-all hover:bg-indigo-700 active:scale-[0.98] shadow-sm hover:shadow"
          >
            Back to Login
          </button>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600"></div></div>}>
      <VerifyContent />
    </Suspense>
  );
}
