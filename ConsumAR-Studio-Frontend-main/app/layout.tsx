import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TIF Studio - 3D Model Generator",
  description: "Create and edit 3D models for your products",
  icons: {
    icon: "/TIFLabs-Logo.png",
    shortcut: "/TIFLabs-Logo.png",
    apple: "/TIFLabs-Logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${outfit.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
      </body>
    </html>
  );
}
