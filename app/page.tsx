import type { Metadata } from "next";
import { OreoGameApp } from "../components/OreoGameApp";

export const metadata: Metadata = {
  title: { absolute: "超级奥利奥｜3D 在线闯关" },
  description:
    "和朋友一起进入明亮的 3D 平台世界，跳跃、收集、穿越机关并冲向终点。",
};

export default function Home() {
  return <OreoGameApp />;
}
