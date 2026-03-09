import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import { VisualEditsMessenger } from "orchids-visual-edits";
import { Sidebar } from "@/components/Sidebar";
import { AppProvider } from "@/context/AppContext";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-chanakya",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Chanakya",
  description: "AI-native analytics for Sportomic",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} antialiased bg-background text-foreground flex`}
      >
        <AppProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            {children}
          </main>
          <Toaster theme="dark" position="bottom-right" richColors />
          <VisualEditsMessenger />
        </AppProvider>
      </body>
    </html>
  );
}
