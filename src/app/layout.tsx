import type { Metadata } from "next";
import { NavBar } from "@/components";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quanzhan · AI 全栈项目教练",
  description: "从零到完整项目：AI 教学、做题、代码审查与选型实验一体化的学习平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
