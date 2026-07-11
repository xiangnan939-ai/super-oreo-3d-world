# 超级奥利奥

原创浏览器第三人称 3D 在线闯关游戏。玩家可在 X/Z 平面自由探索立体箱庭，用鼠标环绕相机，并通过 Cloudflare Durable Objects 与最多三位朋友实时联机。

> 本项目采用原创饼干探险家、关卡、贴图与程序化音效。它借鉴经典 3D 平台冒险的明亮箱庭节奏，但不包含任天堂角色、徽标、关卡、音乐或原作资源。

## 可玩内容

- 真 3D 关卡「晴空绒线庭」：多方向折返路线、草地岛、高低平台、台阶、移动平台与透明风带管
- 78 枚金币、3 枚星章、11 个敌人、3 个检查点、尖刺/水面/虚空危险区和太阳门终点
- 第三人称相机：点击画面锁定鼠标，移动鼠标环绕，滚轮缩放，`Esc` 释放
- 键盘：`W` `S` `A` `D` 自由移动，`Space` 跳跃，`Shift` 冲刺，`R` 重开
- 触控：四向移动、冲刺、跳跃
- 60 Hz 确定性 3D 物理：可变跳高、Coyote time、Jump buffer、踩踏、移动平台与检查点重生
- 最多 4 人房间码联机；无法连接云端时自动启用同浏览器标签页回退通道
- 原创 Web Audio 节拍与事件音效，无外部音乐版权依赖

## 技术结构

- `game/world3d.ts`：完整 X/Y/Z 箱庭关卡数据
- `game/simulation3d.ts`：纯 TypeScript、可序列化、固定 60 Hz 的 3D 物理与规则
- `game/engine.ts`：Three.js 场景、第三人称相机、角色、动画、贴图、粒子与音频
- `game/network.ts`：房间客户端、位置同步和本地回退
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
node --test tests/simulation3d.test.mjs
npm run build:pages
```

视觉比对、交互坐标和浏览器控制台验收记录见 `design-qa.md`。

## Cloudflare 发布

```bash
# 1. 发布房间 Worker（创建 Durable Object 迁移）
npm run deploy:room

# 2. 构建静态站点与 Pages Functions 同源网关
npm run build:pages

# 3. 发布到 Pages
npm run deploy:pages
```

`wrangler.jsonc` 把 Pages Functions 绑定到独立 Worker 中的 `GameRoom` Durable Object；浏览器只访问 `pages.dev/api`，因此无需依赖某些网络环境会拦截的公开 `workers.dev` 域名。`wrangler.room.jsonc` 已把直接 Worker API 的 CORS 白名单收紧到生产 Pages 域名。
