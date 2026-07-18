# Design QA — 超级奥利奥六境远征

## Evidence

- Source reference: `/Users/xn/Downloads/54B14EBA-A6B1-4908-B592-A168BC57449F.PNG`
- Final implementation capture: `/Users/xn/Downloads/游戏网站/work/gameplay-qa-path-fixed.png`
- Side-by-side comparison: `/Users/xn/Downloads/游戏网站/work/design-qa-comparison-final.png`
- Comparison state: gameplay, third-person camera, desktop viewport at the reference height; the source was center-cropped by 36 px to match the browser capture width without scaling.
- Expansion QA state (2026-07-14): clean local browser sessions at the opening garden, sugar-frost valley, cocoa furnace and moon temple using the development-only `qaSpawn` hook.
- Chat/developer QA state (2026-07-18): two live local room tabs plus single-player command/menu verification at the opening garden.
- Adventure redesign QA state (2026-07-19): current-run captures at the new Windmill Village and Moon Observatory, saved as `work/product-design-audit-2026-07-19/05-after-village.png` and `work/product-design-audit-2026-07-19/07-after-moon.png`.

## Visual match review

- Passed: full-screen bright sky, broad playable X/Z garden island, warm ochre platform sides, tactile green grass, yellow route, white fence, coins, enemies, elevated terraces and transparent tube all read as a true 3D box-garden.
- Passed: the player is framed in a third-person foreground position with distant traversal landmarks visible, rather than on a locked side-scrolling lane.
- Passed: top-left avatar/lives, 187-coin counter, five-star route, moon-shard counter plus top-right timer/score follow the reference HUD hierarchy while using original and CC0 replacement assets.
- Passed: the yellow route and two-sided direction sign are visible from the opening camera after the final iteration.
- Passed: the six zones have distinct silhouettes and atmosphere—green yarn garden, brass harbor, cloud climb, pale ice valley, orange cocoa furnace and violet moon temple—without breaking the continuous-world sightlines.
- Passed: ice, conveyors, scheduled steam/lava hazards, wind tubes, moving platforms and enemy variants are all visibly communicated before contact.
- Intentional difference: Nintendo characters, logos, question blocks, textures and audio were not copied. They were replaced by an original cookie explorer, procedural materials, original audio and a small attributed Kenney CC0 asset set while preserving the requested cheerful toy-diorama direction.

## Interaction and runtime QA

- W movement changed world position from `(-55.000, 0.700, -42.000)` to `(-53.121, 0.700, -40.071)`, confirming camera-relative movement across both X and Z.
- D movement then changed position to `(-54.813, 0.700, -38.379)`, confirming an independent lateral 3D axis.
- Space changed Y from `0.700` to `1.276` and grounded state from `true` to `false`.
- Mouse drag changed camera yaw from `-2.4200` to `-3.1240`; pointer lock remains the primary desktop behavior with drag as fallback.
- `Tab` opened the pause layer; `设置` exposed sensitivity, vertical inversion, pointer lock, sound and eight remappable actions.
- Air dash was rebound from `E` to `F`, reflected immediately in its accessible label, then restored to `E`; `保存并继续` resumed the simulation.
- `主菜单` exited the live moon-temple run and restored the complete initial menu.
- Fresh opening, frost, cocoa and moon browser runs reported no application console warnings or errors; all referenced GLB textures loaded successfully.
- `T` opened the semi-transparent room chat; click and `Enter` submission both rendered the sender and timestamp, while closed recipients received an unread badge.
- A two-tab room exchanged `房主广播测试` and `访客回复测试` in both directions, proving that messages reach every participant rather than remaining local UI state.
- `/develop` enabled a local-only developer session, `` ` `` opened and hid its top-left menu, and changing lives from 5 to 12 updated the HUD immediately. Flight and invulnerability switches also reflected their active state.
- Host and guest browser consoles remained free of warnings and errors throughout the chat relay test.
- The cocoa and moon QA spawns settled on authored collision tops at `(-17.000, 11.700, 243.000)` and `(35.000, 16.700, 284.000)` respectively.
- Product Design audit found that the previous late game read as isolated floating ribbons; the redesign adds seven broad exploration courtyards, physical scenery blockers, loop roads, six landmark families, seven arena guardians and four new rhythmic hazards across all six realms.
- The final moon gate now requires any three of five star medals. The HUD explains the live `x/3` quest state and the gate core visibly changes from dormant to powered, so side exploration affects progression rather than only score.
- Moving-platform fuzzing reproduced a `-6.205` unit one-tick teleport when an orbit platform caught the player from behind. Direction-aware overlap recovery eliminates that far-edge snap; three dedicated edge/carrier regression tests cover idle edges, lower docks and catch-up collisions.
- TypeScript, ESLint, Cloudflare Pages production build and all 53 deterministic/network/rendering regression tests passed.

## Outstanding issues

- No P1 or P2 visual, interaction, or accessibility blockers found in the final state.

final result: passed
