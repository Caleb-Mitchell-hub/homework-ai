import type { Metadata } from "next";
import "./globals.css";
import Layout from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import { CategoryProvider } from "@/contexts/CategoryContext";
import { QuizCategoryProvider } from "@/contexts/QuizCategoryContext";
import InitClient from "@/components/InitClient";
import { DialogProvider } from "@/components/DialogProvider";

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
    <html lang="zh-CN">
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
