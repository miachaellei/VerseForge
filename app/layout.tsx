import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "声篇工坊 · 云端小说创作",
  description: "管理长篇小说梗概、人物、关系图谱、时间线与章节创作。",
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
