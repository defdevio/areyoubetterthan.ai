import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ResultToasts, SiteHeader, SiteHeaderShell } from "@/components/site-header";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "areyoubetterthan.ai: the human control group for SWE-bench",
    template: "%s · areyoubetterthan.ai",
  },
  description:
    "Fix real GitHub issues from SWE-bench Verified in 15 minutes, get graded by the official harness, and see how you stack up against every AI model on the exact same tasks.",
  openGraph: { siteName: "areyoubetterthan.ai", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#09090b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Suspense fallback={<SiteHeaderShell />}>
            <SiteHeader />
          </Suspense>
          <ResultToasts />
          <div className="flex flex-1 flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
