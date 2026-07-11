import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  return {
    title: {
      default: "超级奥利奥｜3D 在线闯关",
      template: "%s｜超级奥利奥",
    },
    description:
      "一款原创的浏览器 3D 多人平台闯关游戏。创建房间，邀请朋友，一起冲向终点。",
    applicationName: "超级奥利奥",
    openGraph: {
      title: "超级奥利奥｜3D 在线闯关",
      description: "跳进青空遗迹，和朋友一起完成一场 3D 平台冒险。",
      type: "website",
      locale: "zh_CN",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "超级奥利奥 3D 在线闯关" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "超级奥利奥｜3D 在线闯关",
      description: "跳进青空遗迹，和朋友一起完成一场 3D 平台冒险。",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#55b8f6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
