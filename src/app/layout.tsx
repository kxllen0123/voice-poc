import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "尘螨防控助手",
  description: "声音引导尘螨检查",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body className="bg-[#111] antialiased">
        <div className="max-w-[430px] mx-auto h-dvh overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
