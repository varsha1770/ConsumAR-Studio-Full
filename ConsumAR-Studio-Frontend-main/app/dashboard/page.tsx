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
  ExclamationTriangleIcon,
  TrashIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";

/**
 * THE DASHBOARD: A premium view of the user's activity history and account controls.
 * Updated to a highly-polished Light Mode UI.
 */
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [userTier, setUserTier] = useState<string>("FREE");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Account deleted. Goodbye!");
        const { signOut } = await import("next-auth/react");
        signOut({ callbackUrl: "/" });
      } else {
        toast.error(data.error || "Failed to delete account.");
      }
    } catch (err) {
      toast.error("An error occurred during deletion.");
    } finally {
      setIsDeleting(false);
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
  const maxDownloads = userTier === "PAID" ? 10 : 2;

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
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-200/40 blur-[120px] rounded-full"></div>
        <div className="absolute top-[20%] -right-[5%] w-[40%] h-[40%] bg-purple-200/40 blur-[100px] rounded-full"></div>
      </div>

      <main className="relative z-10 container mx-auto pt-12 pb-24 max-w-6xl px-6 lg:px-8">
        
        {/* HERO HEADER */}
        <div className="mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="animate-in slide-in-from-left duration-700">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900">
              Your Creative <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Journey</span>
            </h1>
            <p className="mt-4 text-lg text-slate-500 font-medium max-w-2xl">
              Track your evolution through the world of 3D. Review every conversion, resize, and innovation you've built.
            </p>
          </div>
          <Link
            href="/studio"
            className="group inline-flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl font-bold transition-all hover:bg-indigo-600 hover:shadow-xl hover:shadow-indigo-200 active:scale-95 animate-in slide-in-from-right duration-700"
          >
            Enter the Studio
            <ArrowRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* STATS GRID */}
        <div className="mb-12 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 border border-slate-200/60 shadow-xl shadow-slate-200/40 transition-all hover:bg-white hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-100">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
              <ChartBarIcon className="w-32 h-32 text-indigo-600" />
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                <ChartBarIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Actions</h3>
            </div>
            <p className="text-5xl font-black text-slate-900 tabular-nums relative z-10">{history.length}</p>
            <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(79,70,229,0.5)]" style={{ width: `${Math.min(history.length * 5, 100)}%` }}></div>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 border border-slate-200/60 shadow-xl shadow-slate-200/40 transition-all hover:bg-white hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-100">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
              <ArrowPathRoundedSquareIcon className="w-32 h-32 text-purple-600" />
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-xl">
                <ArrowPathRoundedSquareIcon className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversions</h3>
            </div>
            <p className="text-5xl font-black text-slate-900 tabular-nums relative z-10">{conversionsCount}</p>
            <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
              <div className="h-full bg-purple-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(147,51,234,0.5)]" style={{ width: `${Math.min(conversionsCount * 10, 100)}%` }}></div>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 border border-slate-200/60 shadow-xl shadow-slate-200/40 transition-all hover:bg-white hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-100">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
              <CloudIcon className="w-32 h-32 text-emerald-600" />
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                <CloudIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Storage Status</h3>
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <p className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Active</p>
              <div className="flex space-x-1.5 mt-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-emerald-500/40 animate-pulse delay-75"></div>
                <div className="w-2 h-2 rounded-full bg-emerald-500/20 animate-pulse delay-150"></div>
              </div>
            </div>
            <p className="mt-5 text-sm text-slate-500 font-medium relative z-10">All systems securely linked.</p>
          </div>
        </div>

        {/* ACTIVITY TABLE SECTION */}
        <div className="animate-in fade-in slide-in-from-bottom-12 duration-700 delay-300">
          <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] border border-slate-200/60 shadow-2xl shadow-slate-200/40 overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <ClockIcon className="w-7 h-7 text-indigo-600" />
                Activity Timeline
              </h2>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
                Showing {history.length} events
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-10 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Timestamp</th>
                    <th className="px-10 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Operation</th>
                    <th className="px-10 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Target File</th>
                    <th className="px-10 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] text-right">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length > 0 ? (
                    history.map((item, idx) => {
                      const isExpired = getDaysUntilExpiry(item.createdAt) === 0;
                      return (
                      <tr key={`${item.id}-${idx}`} className={`group transition-all duration-300 bg-white ${isExpired ? "opacity-40 grayscale" : "hover:bg-slate-50"}`}>
                        <td className="px-10 py-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">
                              {new Date(item.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium font-mono mt-0.5">
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`text-[9px] font-bold mt-2 uppercase tracking-widest ${isExpired ? "text-red-500" : "text-amber-500"}`}>
                              {isExpired ? "Expired" : `Expires in ${getDaysUntilExpiry(item.createdAt)}d`}
                            </span>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                            (item.action === 'CONVERT' || item.action === 'CONVERSION' || item.action === 'USDZ_CONVERT') ? 'bg-purple-50 text-purple-600 border-purple-200 shadow-sm' :
                            item.action === 'RESCALE' || item.action === 'RESIZE' ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' :
                            'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm'
                          }`}>
                            {item.action === 'RESCALE' || item.action === 'RESIZE' ? <ChartBarIcon className="w-3 h-3" /> : <DocumentIcon className="w-3 h-3" />}
                            {item.action.replace('_CONVERT', '')}
                          </span>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-indigo-600 group-hover:border-indigo-300 transition-all shadow-sm">
                              <DocumentIcon className="w-5 h-5" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 max-w-[200px] sm:max-w-xs truncate">{item.fileName}</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex flex-col items-end gap-2">
                            <span className={`text-[10px] font-bold tracking-widest uppercase ${item.downloadCount >= maxDownloads ? "text-red-500" : "text-slate-400"}`}>
                              DL: {item.downloadCount}/{maxDownloads}
                            </span>
                            <div className="flex items-center justify-end gap-2">
                              {!isExpired && item.glbFile && (
                                <button 
                                  onClick={() => handleDownload(item.id, item.details === "Persistent Activity Record" ? "activity" : "history", item.glbFile!, "model.glb")}
                                  className="p-2 bg-slate-50 border border-slate-200 hover:bg-white hover:border-indigo-200 rounded-lg transition-all hover:text-indigo-600 text-slate-400 shadow-sm"
                                  title="Download GLB"
                                >
                                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                </button>
                              )}
                              {!isExpired && item.usdzFile && (
                                <button 
                                  onClick={() => handleDownload(item.id, item.details === "Persistent Activity Record" ? "activity" : "history", item.usdzFile!, "model.usdz")}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white border border-slate-800 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-indigo-600 hover:border-indigo-600 transition-all shadow-md"
                                >
                                  <CloudIcon className="w-3.5 h-3.5" />
                                  USDZ
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )})
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-10 py-32 text-center bg-white">
                        <div className="flex flex-col items-center gap-5">
                          <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300">
                            <ClockIcon className="w-8 h-8" />
                          </div>
                          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No traces found</p>
                          <Link href="/studio" className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline text-sm transition-colors">Initiate First Sequence</Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* DANGER ZONE */}
        <div className="mt-24 p-1 relative overflow-hidden rounded-[3rem] animate-in fade-in slide-in-from-bottom-12 duration-700 delay-500">
          <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-red-100/50 backdrop-blur-xl"></div>
          <div className="relative bg-white/80 backdrop-blur-md border border-red-200 p-12 rounded-[2.9rem] flex flex-col lg:flex-row items-center justify-between gap-12 shadow-xl shadow-red-100/50">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-100 border border-red-200 text-red-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-5 shadow-sm">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                Terminal Security Layer
              </div>
              <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Self-Destruct Protocol</h2>
              <p className="mt-4 text-slate-500 font-medium max-w-xl leading-relaxed text-sm">
                Permanently eliminate your digital footprint. All associated GLB/USDZ models, telemetry, and configurations will be irreversibly atomized.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="group relative px-10 py-5 bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-200 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              Initiate Wipe
            </button>
          </div>
        </div>

        <footer className="mt-24 text-center">
          <div className="flex items-center justify-center gap-8 mb-8">
            <Link href="/privacy" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">Privacy Protocols</Link>
            <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
            <Link href="/terms" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">Usage Standards</Link>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
            Powered by TIFLabs Cinematic Engine © 2026
          </p>
        </footer>
      </main>

      {/* REFINED SELF-DESTRUCT MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-full max-w-md bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
            {/* Glowing top line */}
            <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-80"></div>
            
            <div className="relative z-10">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 border border-red-100 mb-8 shadow-sm">
                <ExclamationTriangleIcon className="h-10 w-10 text-red-600" />
              </div>
              
              <h3 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight mb-4">
                Final <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-700">Warning</span>
              </h3>
              
              <p className="text-center text-slate-500 font-medium leading-relaxed mb-8 px-2 text-sm">
                This operation is <span className="text-red-600 font-bold tracking-wide">PERMANENT</span>. Once authorized, your workspace will be <strong className="text-slate-900">atomized</strong>. This cannot be undone.
              </p>

              {/* Persistence Notice - DPDP Compliant */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-8 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed">
                    DPDP Compliance Guarantee:<br/> <span className="text-emerald-700 font-extrabold tracking-wider">100% of your activity logs, history, and models will be permanently purged.</span>
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  disabled={isDeleting}
                  onClick={handleDeleteAccount}
                  className="group relative w-full h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-[0.15em] text-[11px] shadow-lg shadow-red-600/20 transition-all active:scale-[0.98] disabled:opacity-50 overflow-hidden"
                >
                  <div className="flex items-center justify-center gap-2.5 relative z-10">
                    {isDeleting ? (
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                        <span>Purging Data...</span>
                      </div>
                    ) : (
                      <>
                        <TrashIcon className="w-4 h-4" />
                        <span>Authorize Wipe</span>
                      </>
                    )}
                  </div>
                </button>
                
                <button
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full h-14 rounded-xl border border-slate-200 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-[0.98]"
                >
                  Abort Sequence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
