"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import StudioHeader from "@/components/StudioHeader";
import { toast } from "react-hot-toast";

interface HistoryItem {
  id: string;
  fileName: string;
  action: string;
  glbFile: string | null;
  usdzFile: string | null;
  details: string | null;
  downloadCount: number;
  createdAt: string;
}

import {
  ChartBarIcon,
  ArrowPathRoundedSquareIcon,
  CloudIcon,
  ClockIcon,
  DocumentIcon,
  ArrowTopRightOnSquareIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [userTier, setUserTier] = useState<string>("FREE");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated") {
      fetchHistory();
    }
  }, [status]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/user/history");
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
        setUserTier(data.tier || "FREE");
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
      toast.error("Could not load your history.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (id: string, type: string, url: string, fileName: string) => {
    try {
      const downloadEndpoint = `/api/user/download?id=${id}&type=${type}&url=${encodeURIComponent(url)}`;
      const res = await fetch(downloadEndpoint, { method: 'GET', redirect: 'manual' });

      if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 307) {
        window.open(downloadEndpoint, '_blank');
        setTimeout(fetchHistory, 2000);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Download failed. Limit reached?");
      } else {
        window.open(downloadEndpoint, '_blank');
        setTimeout(fetchHistory, 2000);
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to initiate download.");
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfdfd]">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-600/20 border-t-indigo-600"></div>
          <div className="absolute h-8 w-8 animate-pulse rounded-full bg-indigo-600/10"></div>
        </div>
      </div>
    );
  }

  const conversionsCount = history.filter(h => h.action === 'CONVERT' || h.action === 'CONVERSION' || h.action === 'USDZ_CONVERT').length;
  const usdzCount = history.filter(h => h.action === 'USDZ_CONVERT' || h.usdzFile !== null).length;
  const maxDownloads = 999999;

  const getDaysUntilExpiry = (createdAt: string) => {
    const createdDate = new Date(createdAt);
    const expiryDays = userTier === "PAID" ? 30 : 7;
    const expiryDate = new Date(createdDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? daysLeft : 0;
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-600 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <StudioHeader />

      {/* BACKGROUND ACCENTS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[80%] md:w-[50%] h-[50%] bg-indigo-200/40 blur-[80px] md:blur-[120px] rounded-full"></div>
        <div className="absolute top-[20%] -right-[5%] w-[60%] md:w-[40%] h-[40%] bg-purple-200/40 blur-[80px] md:blur-[100px] rounded-full"></div>
      </div>

      <main className="relative z-10 container mx-auto pt-8 md:pt-12 pb-16 md:pb-24 max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* HERO HEADER */}
        <div className="mb-8 md:mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-6 md:gap-8">
          <div className="animate-in slide-in-from-left duration-700 text-center lg:text-left">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900">
              Your Creative <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Journey</span>
            </h1>

            <p className="mt-3 md:mt-4 text-base sm:text-lg text-slate-500 font-medium max-w-2xl mx-auto lg:mx-0">
              Track your evolution through the world of 3D & AR. Review every conversion, USDZ experience, and model scaling built.
            </p>
          </div>
          <Link
            href="/studio"
            className="group flex sm:inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl font-bold transition-all hover:bg-indigo-600 hover:shadow-xl hover:shadow-indigo-200 active:scale-95 animate-in slide-in-from-right duration-700 w-full sm:w-auto"
          >
            Enter the Studio
            <ArrowRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* STATS GRID */}
        <div className="mb-6 md:mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-6 duration-500 delay-100">
          {/* Total Actions */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-slate-200/60 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-10 transition-opacity">
              <ChartBarIcon className="w-16 h-16 md:w-20 md:h-20 text-indigo-600" />
            </div>
            <div className="flex items-center gap-2 mb-2 md:mb-3 relative z-10">
              <div className="p-1.5 sm:p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                <ChartBarIcon className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Actions</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums relative z-10">{history.length}</p>
            <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(history.length * 5, 100)}%` }}></div>
            </div>
          </div>

          {/* Conversions */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-slate-200/60 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-10 transition-opacity">
              <ArrowPathRoundedSquareIcon className="w-16 h-16 md:w-20 md:h-20 text-purple-600" />
            </div>
            <div className="flex items-center gap-2 mb-2 md:mb-3 relative z-10">
              <div className="p-1.5 sm:p-2 bg-purple-50 border border-purple-100 rounded-lg">
                <ArrowPathRoundedSquareIcon className="w-4 h-4 text-purple-600" />
              </div>
              <h3 className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Conversions</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums relative z-10">{conversionsCount}</p>
            <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-purple-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(conversionsCount * 10, 100)}%` }}></div>
            </div>
          </div>

          {/* USDZ AR Usage Card */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-slate-200/60 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-10 transition-opacity">
              <CloudIcon className="w-16 h-16 md:w-20 md:h-20 text-blue-600" />
            </div>
            <div className="flex items-center gap-2 mb-2 md:mb-3 relative z-10">
              <div className="p-1.5 sm:p-2 bg-blue-50 border border-blue-100 rounded-lg">
                <CloudIcon className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">USDZ AR Usage</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums relative z-10">{usdzCount}</p>
            <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-blue-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(usdzCount * 15, 100)}%` }}></div>
            </div>
          </div>

          {/* Storage Status */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-slate-200/60 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-10 transition-opacity">
              <CloudIcon className="w-16 h-16 md:w-20 md:h-20 text-emerald-600" />
            </div>
            <div className="flex items-center gap-2 mb-2 md:mb-3 relative z-10">
              <div className="p-1.5 sm:p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                <CloudIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Storage Status</h3>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 relative z-10">
              <p className="text-xl sm:text-2xl font-bold text-slate-900 uppercase italic tracking-tight">Active</p>
              <div className="flex space-x-1 sm:space-x-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-pulse"></div>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500/40 animate-pulse delay-75"></div>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500/20 animate-pulse delay-150"></div>
              </div>
            </div>
            <p className="mt-3 text-xs sm:text-sm text-slate-500 font-medium relative z-10">All systems securely linked.</p>
          </div>
        </div>


        {/* ACTIVITY TABLE SECTION */}
        <div className="animate-in fade-in slide-in-from-bottom-10 duration-600 delay-200">
          <div className="bg-white/90 backdrop-blur-xl rounded-xl md:rounded-2xl border border-slate-200 shadow-md overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 md:px-8 py-4 md:py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                Activity Timeline
              </h2>
              <div className="self-start sm:self-auto text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                Showing {history.length} events ({usdzCount} USDZ AR)
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 sm:px-6 md:px-8 py-3 text-[10px] font-bold uppercase text-slate-400 tracking-widest">Timestamp</th>
                    <th className="px-4 sm:px-6 md:px-8 py-3 text-[10px] font-bold uppercase text-slate-400 tracking-widest">Operation</th>
                    <th className="px-4 sm:px-6 md:px-8 py-3 text-[10px] font-bold uppercase text-slate-400 tracking-widest">Target File</th>
                    <th className="px-4 sm:px-6 md:px-8 py-3 text-[10px] font-bold uppercase text-slate-400 tracking-widest text-right">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length > 0 ? (
                    history.map((item, idx) => {
                      const isExpired = getDaysUntilExpiry(item.createdAt) === 0;
                      const isUsdzItem = item.action === 'USDZ_CONVERT' || !!item.usdzFile;
                      return (
                        <tr key={`${item.id}-${idx}`} className={`group transition-colors duration-200 ${isExpired ? "opacity-50" : "hover:bg-slate-50"}`}>
                          {/* Timestamp */}
                          <td className="px-4 sm:px-6 md:px-8 py-3">
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-900">
                                {new Date(item.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${isExpired ? "text-red-500" : "text-amber-500"}`}>
                                {isExpired ? "Expired" : `Expires in ${getDaysUntilExpiry(item.createdAt)}d`}
                              </span>
                            </div>
                          </td>

                          {/* Operation */}
                          <td className="px-4 sm:px-6 md:px-8 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${isUsdzItem
                              ? 'bg-purple-100/90 text-purple-700 border-purple-200 shadow-sm'
                              : item.action === 'RESCALE' || item.action === 'RESIZE'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                              {isUsdzItem ? (
                                <>
                                  <CloudIcon className="w-3.5 h-3.5 text-purple-600" />
                                  <span> USDZ AR</span>
                                </>
                              ) : item.action === 'RESCALE' || item.action === 'RESIZE' ? (
                                <>
                                  <ChartBarIcon className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>3D Scale</span>
                                </>
                              ) : (
                                <>
                                  <DocumentIcon className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{item.action}</span>
                                </>
                              )}
                            </span>
                          </td>

                          {/* Target File */}
                          <td className="px-4 sm:px-6 md:px-8 py-3">
                            <div className="flex items-center gap-3">
                              <div className="hidden sm:flex w-8 h-8 bg-slate-50 border border-slate-200 rounded-md items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors">
                                <DocumentIcon className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{item.fileName}</span>
                            </div>
                          </td>

                          {/* Access */}
                          <td className="px-4 sm:px-6 md:px-8 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Access Secure</span>
                              <div className="flex items-center gap-1.5">
                                {!isExpired && item.glbFile && (
                                  <button
                                    onClick={() => handleDownload(item.id, item.details === "Persistent Activity Record" ? "activity" : "history", item.glbFile!, "model.glb")}
                                    className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-white hover:border-indigo-200 rounded-md transition-colors text-slate-400 hover:text-indigo-600"
                                    title="Download GLB"
                                  >
                                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                  </button>
                                )}
                                {!isExpired && item.usdzFile && (
                                  <button
                                    onClick={() => handleDownload(item.id, item.details === "Persistent Activity Record" ? "activity" : "history", item.usdzFile!, "model.usdz")}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white border border-purple-500 text-[10px] font-bold uppercase rounded-lg hover:shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                    title="View / Download USDZ AR Model"
                                  >
                                    <CloudIcon className="w-3.5 h-3.5" />
                                    <span> USDZ AR</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 sm:px-6 py-16 text-center bg-white">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-300">
                            <ClockIcon className="w-6 h-6" />
                          </div>
                          <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">No traces found</p>
                          <Link href="/studio" className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline text-xs transition-colors">
                            Initiate First Sequence
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>


        <footer className="mt-12 md:mt-20 text-center border-t border-slate-200 pt-6 md:pt-8">
          {/* Links */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4 flex-wrap">
            <Link
              href="/privacy"
              className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors"
            >
              Privacy Protocols
            </Link>
            <span className="hidden sm:block w-px h-4 bg-slate-300"></span>
            <Link
              href="/terms"
              className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors"
            >
              Usage Standards
            </Link>
          </div>

          {/* Copyright */}
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-slate-400">
            Powered by <span className="text-slate-600 font-semibold">TIFLabs Cinematic Engine</span> © 2026
          </p>
        </footer>

      </main>
    </div>
  );
}
