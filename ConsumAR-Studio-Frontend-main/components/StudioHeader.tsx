"use client";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Squares2X2Icon, ArrowLeftOnRectangleIcon, ClockIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

export default function StudioHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isDashboard = pathname === "/dashboard";

  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* HOVER-ACTIVATED FULL LEFT NAVBAR */}
      <div 
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed left-0 top-0 z-50 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
          isHovered 
            ? 'bg-white shadow-[4px_0_24px_rgba(0,0,0,0.05)] border-r border-gray-100 w-52 h-screen' 
            : 'bg-transparent shadow-none border-r border-transparent w-20 h-20'
        }`}
      >
          
          {/* Logo Section - The ONLY trigger for expansion */}
          <div 
            onMouseEnter={() => setIsHovered(true)}
            className="px-5 py-4 flex items-center h-16 cursor-pointer mt-1"
          >
            <div className="flex items-center gap-3 w-48">
              <div 
                className={`relative overflow-hidden shrink-0 w-10 h-10 rounded-xl bg-white transition-all duration-500 ease-out border border-gray-100/50 ${isHovered ? 'scale-110 shadow-[0_0_20px_rgba(99,102,241,0.6)]' : 'scale-100 shadow-[0_4px_10px_rgba(0,0,0,0.08)]'}`}
              >
                <Image 
                  src="/TIFLabs-Logo.png" 
                  alt="TIFLabs Icon" 
                  width={40}
                  height={40}
                  unoptimized
                  className="w-full h-full object-contain p-0.5 relative z-10" 
                />
                
                {/* Animated Shining Effect (Continuous) */}
                <div 
                  className="absolute top-0 w-[150%] h-full bg-gradient-to-r from-transparent via-white/80 to-transparent z-20 animate-shine pointer-events-none"
                />
              </div>
              <span className={`font-semibold text-2xl transition-all duration-500 delay-100 ease-out bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent whitespace-nowrap ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                TIFLabs
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-8 flex flex-col gap-2 px-3 flex-grow w-52">
            <Link href="/dashboard">
              <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ease-in-out ${
                isDashboard 
                   ? 'bg-purple-100 text-purple-700 shadow-sm' 
                  : 'text-gray-700 hover:bg-purple-50 hover:text-purple-700'
              }`}>
                <Squares2X2Icon className="w-6 h-6 shrink-0" /> 
                <span className={`font-medium whitespace-nowrap transition-all duration-300 ease-in-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                  {session ? 'Dashboard' : 'Public History'}
                </span>
              </div>
            </Link>

            <Link href="/logs">
              <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ease-in-out ${
                pathname === "/logs"
                  ? 'bg-blue-100 text-blue-700 shadow-sm' 
                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
              }`}>
                <ClockIcon className="w-6 h-6 shrink-0" /> 
                <span className={`font-medium whitespace-nowrap transition-all duration-300 ease-in-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                  Active Logs
                </span>
              </div>
            </Link>
          </nav>

          {/* Bottom Actions */}
          <div className="p-3 mb-4 w-52 flex flex-col gap-2">
            {session ? (
              <>
                <div className={`px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                  Account
                </div>
                <div className={`flex items-center gap-3 px-3 py-2 mb-2 bg-gray-50 rounded-lg overflow-hidden transition-all duration-300 ${isHovered ? 'opacity-100' : 'opacity-0 h-0 p-0 mb-0'}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {session.user?.email?.[0].toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-gray-900 truncate">{session.user?.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-50 text-gray-600 hover:text-red-700 transition-all duration-300 ease-in-out"
                >
                  <ArrowLeftOnRectangleIcon className="w-6 h-6 shrink-0" />
                  <span className={`font-medium whitespace-nowrap transition-all duration-300 ease-in-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                    Sign Out
                  </span>
                </button>
              </>
            ) : (
              <Link href="/login">
                <div className="w-full flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:shadow-lg transition-all duration-300 ease-in-out">
                  <ArrowLeftOnRectangleIcon className="w-6 h-6 shrink-0" />
                  <span className={`font-medium whitespace-nowrap transition-all duration-300 ease-in-out ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                    Sign In
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>

      {/* TOP HEADER (Simplified, pushed right by the sidebar) */}
      <header className="bg-transparent pl-20 relative z-40">
        <div className="container mx-auto px-3 sm:px-5 md:px-6 py-1 max-w-7xl">
          <div className="flex items-center justify-between h-10 sm:h-12">
            
            <div className="flex-1"></div> {/* Spacer for left alignment */}

            <div className="flex-1 flex justify-center pointer-events-none">
              <div className="text-center">
                <h1 className="text-base sm:text-lg font-semibold bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">Tryitfirst Studio</h1>
                <p className="text-[9px] font-medium text-gray-400 hidden sm:block uppercase tracking-widest">3D Asset Optimization & AR Conversion</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 flex-1">
              <a
                href="/privacy"
                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest hidden md:block transition-colors"
              >
                Privacy
              </a>
              <span className="text-[11px] font-bold text-gray-600 bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-1.5 rounded-lg hidden lg:inline-block border border-blue-100/50">
                Tryitfirst Labs
              </span>
              {(session?.user as any)?.isAdmin && (
                <span className="text-[11px] font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1.5 shadow-sm animate-pulse">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  Root Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
