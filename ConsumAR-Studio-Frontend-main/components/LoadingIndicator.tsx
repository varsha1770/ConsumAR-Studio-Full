"use client";

export default function LoadingIndicator({ mini = false, margin = true }: { mini?: boolean; margin?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${margin ? "my-8" : ""}`}>
      <div
        className={`animate-spin rounded-full border-b-2 border-blue-600 ${
          mini ? "h-8 w-8" : "h-16 w-16"
        }`}
      />
    </div>
  );
}
