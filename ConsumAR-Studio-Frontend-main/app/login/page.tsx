"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { validateEmail } from "@/lib/auth";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds

  const { status } = useSession();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (status === "authenticated") {
      router.push("/studio");
    }
  }, [status, router]);

  // Timer for OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "otp" && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && step === "otp") {
      toast.error("Code expired. Please request a new one.");
      setStep("email");
      setOtp("");
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    if (!email) {
      toast.error("Please enter an email");
      return;
    }

    if (!validateEmail(email)) {
      setEmailError("Invalid email format");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        toast.success("Check your inbox for the code!");
        setStep("otp");
        setTimeLeft(300);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send code");
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    const result = await signIn("otp", {
      email,
      otp,
      redirect: false,
    });

    if (result?.error) {
      const errorMessage = result.error === "CredentialsSignin" || result.error === "Credentials"
        ? "Incorrect or expired code. Please try again."
        : result.error;
      toast.error(errorMessage);
      setIsLoading(false);
    } else {
      toast.success("Welcome back!");
      router.push("/studio");
      router.refresh();
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-xl animate-pulse text-indigo-700">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gray-50 p-4 sm:p-6 lg:p-8 relative">
      {/* Branding: Centered on mobile, fixed top-left on desktop */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 md:fixed md:top-8 md:left-8 md:translate-x-0 z-10 pointer-events-none">
        <Image
          src="/TIFLabs-main.png"
          alt="TIF Labs Logo"
          width={150}
          height={50}
          className="h-6 md:h-7 w-auto object-contain transition-all"
          priority
        />
      </div>

      {/* Added mt-12 on mobile to clear the absolute logo, removed on desktop */}
      <div className="mt-12 md:mt-0 w-full max-w-[22rem] sm:max-w-sm rounded-lg border border-gray-200 bg-white p-5 sm:p-8 shadow-lg shadow-gray-200/50 transition-all">
        <h1 className="mb-6 text-center text-xl sm:text-2xl font-serif font-semibold text-gray-800">Login</h1>

        {step === "email" ? (
          <form onSubmit={handleRequestLink} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-900">Email:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="email@example.com"
                autoComplete="email"
                required
              />
              {emailError && <p className="mt-1 text-[11px] font-medium text-red-600">{emailError}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-indigo-600 py-3 sm:py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm"
            >
              {isLoading ? "Sending..." : "Log in / Sign up"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4 text-center">
            <p className="text-sm text-gray-600 px-2">
              We sent a code to <br className="hidden sm:block" />
              <span className="font-semibold text-gray-900 break-all">{email}</span>
            </p>

            <div className="space-y-1 pt-2">
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                // Responsive text sizing and tracking for the OTP input
                className="w-full text-center tracking-[0.3em] sm:tracking-[0.5em] text-xl sm:text-2xl font-medium rounded-md border border-gray-300 px-3 py-3 sm:py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
                placeholder="------"
                autoComplete="one-time-code"
                required
              />
            </div>

            <p className="text-xs text-gray-500">
              Code expires in: <span className="font-mono font-medium text-red-500">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </p>

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full rounded-md bg-indigo-600 mt-2 py-3 sm:py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm"
            >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("email"); setOtp(""); }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline mt-3 inline-block transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
            <span className="bg-white px-3 text-gray-400">Or continue with</span>
          </div>
        </div>

        <button
          type="button"
          disabled={isGoogleLoading}
          onClick={() => {
            setIsGoogleLoading(true);
            signIn("google", { callbackUrl: "/studio" });
          }}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-200 bg-white py-2.5 sm:py-2 px-4 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm"
        >
          {isGoogleLoading ? (
            <div className="flex items-center gap-2 py-0.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600"></div>
              <span>Connecting...</span>
            </div>
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
