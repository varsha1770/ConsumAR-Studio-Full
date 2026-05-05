"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StudioHeader from "@/components/StudioHeader";
import { toast } from "react-hot-toast";
import { 
  ClockIcon, 
  DocumentIcon, 
  ChartBarIcon, 
  ArrowTopRightOnSquareIcon,
  CloudIcon
} from "@heroicons/react/24/outline";

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

export default function LogsPage() {
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
      window.open(downloadEndpoint, '_blank');
      setTimeout(fetchHistory, 2000);
    } catch (err) {
      toast.error("Failed to initiate download.");
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <StudioHeader />

      <main className="relative z-10 container mx-auto pt-12 pb-24 max-w-6xl px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            Active <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Logs</span>
          </h1>
          <p className="mt-4 text-lg text-slate-500 font-medium">
            A granular timeline of your 3D transformations and asset activity.
          </p>
        </div>

        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              <ClockIcon className="w-6 h-6 text-blue-600" />
              Activity Ledger
            </h2>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Real-time synchronization active
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Time & Status</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Operation</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Asset Details</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((item, idx) => {
                  const isExpired = getDaysUntilExpiry(item.createdAt) === 0;
                  return (
                    <tr key={item.id} className={`group transition-all hover:bg-blue-50/20 ${isExpired ? "opacity-40" : ""}`}>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            {new Date(item.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`text-[9px] font-black mt-1 uppercase ${isExpired ? "text-red-500" : "text-blue-500"}`}>
                            {isExpired ? "EXPIRED" : `EXPIRES IN ${getDaysUntilExpiry(item.createdAt)}D`}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          (item.action === 'CONVERT' || item.action === 'CONVERSION') ? 'bg-purple-100 text-purple-700' :
                          item.action === 'RESIZE' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {item.action}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 group-hover:bg-white transition-colors">
                            <DocumentIcon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 max-w-xs truncate">{item.fileName}</span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{item.details}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex flex-col items-end gap-2">
                           <div className="flex items-center gap-2">
                             {!isExpired && item.glbFile && (
                                <button 
                                  onClick={() => handleDownload(item.id, "history", item.glbFile!, "model.glb")}
                                  className="p-2 hover:bg-white rounded-lg transition-all hover:shadow-md text-gray-400 hover:text-blue-600"
                                >
                                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                </button>
                             )}
                             {!isExpired && item.usdzFile && (
                                <button 
                                  onClick={() => handleDownload(item.id, "history", item.usdzFile!, "model.usdz")}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-[9px] font-black rounded-lg hover:bg-blue-600 transition-all shadow-sm"
                                >
                                  <CloudIcon className="w-3.5 h-3.5" />
                                  USDZ
                                </button>
                             )}
                           </div>
                           <span className="text-[9px] font-bold text-gray-400">Downloads: {item.downloadCount}/{maxDownloads}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-24 text-center">
                      <p className="text-gray-400 font-bold uppercase tracking-widest">No activity logged yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
