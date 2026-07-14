# 超级奥利奥

原创浏览器第三人称 3D 在线闯关游戏。玩家可在 X/Z 平面自由探索六个连续主题区域，用鼠标环绕相机，并通过 Cloudflare Durable Objects 与最多三位朋友实时联机。

> 本项目采用原创饼干探险家、关卡设计和程序化材质，并使用少量明确标注来源的 CC0 模型与音效。它借鉴经典 3D 平台冒险的明亮箱庭节奏，但不包含任天堂角色、徽标、关卡、音乐或原作资源。

## 可玩内容

- 真 3D 长关卡「六境奥利奥远征」：绒线草甸、发条港、晴空群岛、糖霜雪原、可可熔炉、月光神殿六个连续区域
- 149 枚金币、5 枚星章、5 枚月辉碎片、22 个差异化敌人、6 个检查点和月光神殿终点
- 59 组静态场景、14 组移动平台、19 组危险区，以及隐藏收集支路、分层捷径和区域目标提示
- 创意机关：冰面惯性、传送带、周期蒸汽、熔岩喷泉、弹簧鼓台、逆风浮桥、透明风带管和空中冲刺
- 第三人称相机：点击画面锁定鼠标，移动鼠标环绕，滚轮缩放，`Esc` 释放
- 键盘：`W` `S` `A` `D` 自由移动，`Space` 跳跃，`Shift` 奔跑，`E` 空中冲刺，`R` 重开，`Tab` 打开暂停菜单
- 个人设置：鼠标灵敏度、垂直视角反转、鼠标锁定、声音和全部游戏按键自定义
- 触控：四向移动、奔跑、空中冲刺、跳跃
- 60 Hz 确定性 3D 物理：可变跳高、Coyote time、Jump buffer、踩踏、冰面、传送带、移动平台与检查点重生
- 最多 4 人房间码联机；房主浏览器通过 WebRTC/定向 WebSocket 星型拓扑转发玩家数据
- 动态区域 HUD、冲刺状态、收集进度与 S/A/B/C 通关评级
- 原创 Web Audio 配乐与事件音效，辅以 Kenney CC0 脚步和碰撞采样，无外部音乐版权依赖

## 技术结构

- `game/world3d.ts`：完整 X/Y/Z 箱庭关卡数据
- `game/simulation3d.ts`：纯 TypeScript、可序列化、固定 60 Hz 的 3D 物理与规则
- `game/engine.ts`：Three.js 场景、第三人称相机、角色、动画、贴图、粒子与音频
- `game/network.ts`：房间客户端、WebRTC 房主中继、定向 WebSocket 回退和本机测试通道
- `worker/room-worker.ts`：独立 Cloudflare Worker + Durable Object 房间服务
- `src/main.tsx`：Cloudflare Pages 静态入口
- `components/`：菜单、大厅、HUD、触控和结算界面

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev:pages -- --host 127.0.0.1 --port 4173
```

联机 Worker 可在另一个终端运行：

```bash
npm run dev:room
```

静态客户端默认通过 Pages 同源 `/api` 网关连接 Durable Object。仅在分离部署或本地联调时需要设置：

```bash
VITE_ROOM_API_ORIGIN=https://your-room-worker.workers.dev npm run build:pages
```

## 验证

```bash
npm run lint
npx tsc --noEmit
node --test tests/*.test.mjs
npm run build:pages
```

视觉比对、交互坐标和浏览器控制台验收记录见 `design-qa.md`。

## 第三方资源

精选模型来自 [Kenney Platformer Kit](https://kenney.nl/assets/platformer-kit)，音效来自 [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)，均按 CC0 发布。仓库内保留了原始许可文本；逐文件清单和来源见 `public/licenses/THIRD_PARTY_ASSETS.md`。

## Cloudflare 发布

```bash
# 1. 发布房间 Worker（创建 Durable Object 迁移）
npm run deploy:room

# 2. 构建静态站点、同源网关并发布到 Pages
npm run deploy:pages
```

`wrangler.jsonc` 把 Pages Functions 绑定到独立 Worker 中的 `GameRoom` Durable Object；浏览器只访问 `pages.dev/api`，因此无需依赖某些网络环境会拦截的公开 `workers.dev` 域名。`wrangler.room.jsonc` 已把直接 Worker API 的 CORS 白名单收紧到生产 Pages 域名。
