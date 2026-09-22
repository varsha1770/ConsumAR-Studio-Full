"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChatBubbleLeftRightIcon, UserIcon, ArrowRightIcon, StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

interface CommentItem {
  id: string;
  name: string;
  image?: string | null;
  comment: string;
  rating?: number;
  bio?: string | null;
  createdAt: string;
}

export default function UserCommentSection() {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchComments();
  }, []);

  const fetchComments = async () => {
    try {
      const res = await fetch("/api/comments");
      const data = await res.json();
      if (data.success && data.comments) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error("Failed to load user comments:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-full py-12 md:py-16 relative overflow-hidden border-t border-slate-200/60">
      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-72 h-72 bg-indigo-200/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-200/20 rounded-full blur-[100px]"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        
        {/* SECTION HEADER */}
        <div className="text-center mb-10 md:mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-3 shadow-sm">
            <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-600" />
            <span>Community Feedback</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            What Creators Say About <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">ConsumAR Studio</span>
          </h2>
          <p className="text-slate-500 text-sm sm:text-base max-w-xl mx-auto mt-2 font-medium">
            Real comments and experiences shared by developers and 3D creators.
          </p>
        </div>

        {/* COMMENTS GRID */}
        {comments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comments.map((item) => (
              <div
                key={item.id}
                className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-2xl md:rounded-3xl p-6 shadow-lg shadow-indigo-500/5 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* RATING STARS & QUOTE ICON */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) =>
                        star <= (item.rating || 5) ? (
                          <StarSolidIcon key={star} className="w-4 h-4 text-amber-400 fill-amber-400" />
                        ) : (
                          <StarOutlineIcon key={star} className="w-4 h-4 text-slate-300" />
                        )
                      )}
                    </div>
                    <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-300" />
                  </div>

                  {/* COMMENT TEXT */}
                  <p className="text-slate-700 text-sm leading-relaxed font-medium italic mb-6">
                    "{item.comment}"
                  </p>
                </div>

                {/* USER INFO */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                      {(item.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {item.name || "Anonymous Creator"}
                    </h4>
                    {item.bio && (
                      <p className="text-[11px] text-slate-400 truncate font-medium">
                        {item.bio}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-8 text-center max-w-md mx-auto shadow-lg">
            <ChatBubbleLeftRightIcon className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Be the First to Comment!</h3>
            <p className="text-xs text-slate-500 font-medium mt-1 mb-4">
              Share your thoughts and rating in your profile to showcase your experience here.
            </p>
          </div>
        )}

        {/* CALL TO ACTION BUTTON TO ADD COMMENT */}
        <div className="mt-10 md:mt-14 text-center">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all"
          >
            <span>{session ? "Leave Your Comment in Profile" : "Sign In & Share Your Feedback"}</span>
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}
