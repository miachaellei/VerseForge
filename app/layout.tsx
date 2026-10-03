import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "声篇工坊 · 本地小说翻写",
  description: "在本机导入、分析、重构并翻写长篇小说。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
