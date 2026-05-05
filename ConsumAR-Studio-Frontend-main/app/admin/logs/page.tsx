"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StudioHeader from "@/components/StudioHeader";
import { toast } from "react-hot-toast";
import { 
  ShieldCheckIcon, 
  ServerIcon, 
  UserGroupIcon, 
  FingerPrintIcon,
  GlobeAltIcon
} from "@heroicons/react/24/outline";

export default function AdminLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated") {
      if (!(session?.user as any)?.isAdmin) {
        toast.error("Restricted Access: Super Admin credentials required.");
        router.push("/dashboard");
      } else {
        fetchGlobalActivities();
      }
    }
  }, [status]);

  const fetchGlobalActivities = async () => {
    try {
      const res = await fetch("/api/admin/activities");
      const data = await res.json();
      if (data.success) {
        setActivities(data.activities);
      } else {
        toast.error(data.error || "Failed to load global ledger.");
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
      toast.error("System error while accessing master ledger.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent shadow-[0_0_20px_rgba(220,38,38,0.3)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-red-500/30">
      <StudioHeader />

      <main className="container mx-auto pt-16 pb-24 max-w-7xl px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-950/30 border border-red-500/20 rounded-full text-[10px] font-black text-red-500 uppercase tracking-widest mb-4">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Root Admin Access
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
              Global <span className="text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">Ledger</span>
            </h1>
            <p className="mt-2 text-slate-500 font-medium text-sm">
              Real-time synchronization of all 3D asset transformations across the global node network.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl">
              <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Total Logs</div>
              <div className="text-2xl font-black italic">{activities.length}</div>
            </div>
            <div className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl">
              <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Active Nodes</div>
              <div className="text-2xl font-black italic text-green-500">Live</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest">Temporal Stamp</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest">Identity / IP</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest">Operation</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Target Asset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activities.map((item) => (
                  <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-300">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                          <FingerPrintIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col max-w-[200px]">
                          <span className="text-xs font-bold text-slate-200 truncate">{item.userEmail || "Anonymous"}</span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <GlobeAltIcon className="w-3 h-3" />
                            {item.ipAddress || "Unknown"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider ${
                        item.type === 'RESCALE' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        item.type === 'USDZ_CONVERT' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className="text-xs font-bold text-slate-400 max-w-[150px] truncate block ml-auto">
                        {item.fileName}
                      </span>
                    </td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-32 text-center text-slate-600 font-bold uppercase tracking-widest text-sm italic">
                      Zero global activity recorded. Nodes idle.
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
