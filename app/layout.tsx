import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { themeCss } from "@/lib/theme";

const inter = localFont({ src: "./fonts/inter-latin-wght-normal.woff2", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Watchman Forecasting", template: "%s · Watchman Forecasting" },
  description: "Watchman Forecasting Model — see every forecast change coming.",
};
export const viewport: Viewport = { themeColor: "#0E2742" };

// The saved theme choice is applied before the page draws (no flash).
const themeBoot = `try{var t=localStorage.getItem("wf_theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
