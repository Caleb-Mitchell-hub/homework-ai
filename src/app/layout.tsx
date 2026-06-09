import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import Layout from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import { CategoryProvider } from "@/contexts/CategoryContext";
import { QuizCategoryProvider } from "@/contexts/QuizCategoryContext";
import InitClient from "@/components/InitClient";
import { DialogProvider } from "@/components/DialogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "在线答题系统",
  description: "上传 Markdown 文件，自动解析题目并判分",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}>
      <body className="antialiased">
        <InitClient />
        <DialogProvider>
          <AuthProvider>
            <CategoryProvider>
              <QuizCategoryProvider>
                <Layout>{children}</Layout>
              </QuizCategoryProvider>
            </CategoryProvider>
          </AuthProvider>
        </DialogProvider>
      </body>
    </html>
  );
}
