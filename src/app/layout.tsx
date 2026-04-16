import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MainWrapper } from "@/components/dashboard/main-wrapper";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DOAI Call Assistant",
  description: "24/7 AI-powered call assistant for DOAI Systems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="h-full flex bg-[#0d1117] text-slate-200 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <MainWrapper>{children}</MainWrapper>
        </main>
      </body>
    </html>
  );
}
