"use client";

export default function LoadingIndicator({ mini = false, margin = true }: { mini?: boolean; margin?: boolean }) {
  return (
    <div className={`flex items-center justify-center transition-all ${margin ? "my-4 sm:my-6 md:my-8" : ""}`}>
      <div
        className={`animate-spin rounded-full border-blue-600 transition-all duration-300 ${mini
          ? "h-6 w-6 sm:h-8 sm:w-8 border-b-2"
          : "h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 border-b-2 sm:border-b-4"
          }`}
      />
    </div>
  );
}
