import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "./globals.css";
import {Analytics} from "@/components/analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.metricmage.co.uk"),
  title: {
    default: "Metric Mage",
    template: "%s · Metric Mage",
  },
  description:
    "See what changed across your business tools, and what to do next, in plain English.",
  // Proves to Google Search Console that this site is ours.
  verification: {google: "FwnNp0NxlE5gPFwfAfnpfjHFSX_OujOqI33IaiUaxP4"},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-100 text-zinc-950">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
