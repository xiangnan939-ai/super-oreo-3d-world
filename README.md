# 超级奥利奥

原创浏览器 3D 多人平台闯关游戏。角色采用不同夹心配色的奥利奥人物，关卡、敌人、音效与视觉素材均为原创实现；玩法节奏致敬经典平台冒险，但不包含任天堂角色、关卡、贴图或音乐文件。

## 当前可玩内容

- 3D 关卡「青空遗迹」，全长 168 单位，目标时长约 2–4 分钟
- 4 个奥利奥角色配色，支持键盘与触屏
- 左右移动、冲刺、可变跳高、100ms Coyote time、120ms Jump buffer
- 静态和移动平台、原创导风管、敌人、尖刺、深坑、检查点、终点
- 57 个星饼/特殊收集物，踩踏敌人和检查点重生
- 创建/加入 6 位房间码，最多 4 人，实时同步远端角色
- Cloudflare Durable Object 房间大厅、准备、开局、断线房主迁移
- 无法连接云端房间时自动使用同源标签页联机演示
- Web Audio 实时合成原创复古提示音与背景节拍，无外部音频版权依赖

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

访问开发服务器输出的地址（默认 `http://localhost:3000`）。

## 操作

| 动作 | 键盘 | 触屏 |
| --- | --- | --- |
| 左右移动 | `A` / `D` 或方向键 | 左右圆形按钮 |
| 跳跃 | `Space` / `W` / `↑` | 「跳跃」按钮 |
| 冲刺 | `Shift` | `⇧` 按钮 |

短按跳跃为小跳，持续按住可跳得更高。移动到旗帜处会激活检查点。

## 技术结构

- `game/simulation.ts`：纯 TypeScript、可序列化、固定 60Hz 的物理与规则
- `game/level.ts`：数据驱动的完整关卡定义
- `game/engine.ts`：Three.js 场景、角色、动画、相机、粒子和音频
- `game/network.ts`：房间客户端、状态同步与本机回退通道
- `worker/index.ts`：Cloudflare Worker 与 Durable Object 房间服务
- `components/`：大厅、HUD、触控和结果界面

联机房间使用 Durable Object 管理低频房间状态与 WebSocket 状态转发；客户端以 20Hz 发送位置帧。计划书中更进一步的 WebRTC/TURN、D1 排行榜可在后续版本接入，不影响当前游戏核心和房间流程。

## 验证

```bash
npm run lint
npm test
```

`npm test` 会执行生产构建、服务端页面检查，以及 60Hz 移动、跳跃、Coyote time、Jump buffer、移动平台、危险物、检查点、敌人和终点测试。

## Cloudflare 部署

项目保留 `vinext` 与 Cloudflare Vite 配置。部署环境需要创建 `GAME_ROOMS` Durable Object 绑定并应用 `v1-game-room` 迁移；生产站点与房间 API 由同一 Worker 提供，因此邀请链接可直接跨设备使用。
