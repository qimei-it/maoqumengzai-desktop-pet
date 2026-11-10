# Third-party notices

毛趣萌仔包含以下第三方代码与素材。分发时保留本文件与对应许可证原文。

## Ported code

| 组件 | 许可 | 来源 | 使用位置 |
| --- | --- | --- | --- |
| Filee 轮盘几何与拖拽交互 | MIT，Copyright (c) 2026 Myeonggu Kim (KnifeLemon) and Filee contributors | https://github.com/KnifeLemon/Filee （`src/Filee.App/Controls/DonutGeometry.cs`、`DonutMenu.cs`、`Services/RadialController.cs`） | `src/shared/donut.ts`、`src/renderer/DonutMenu.vue`、`src/main/index.ts` 的窗口扩展；已改写为 TypeScript/Vue 并统一 mqmz 命名 |

许可证原文：`resources/licenses/filee-MIT.txt`。

## Libraries

| 组件 | 许可 | 来源 |
| --- | --- | --- |
| Electron | MIT | https://github.com/electron/electron |
| Vue | MIT | https://github.com/vuejs/core |
| electron-vite / Vite | MIT | https://github.com/alex8088/electron-vite |
| electron-builder | MIT | https://github.com/electron-userland/electron-builder |
| Lucide | ISC（部分图标 MIT） | https://github.com/lucide-icons/lucide |
| opencc-js | MIT（词典另含 Apache-2.0） | https://github.com/nk2028/opencc-js |
| sharp | Apache-2.0 | https://github.com/lovell/sharp |
| libvips（sharp 预编译包） | LGPL-3.0 及组件各自许可 | https://github.com/libvips/libvips |
| pdf-lib | MIT | https://github.com/Hopding/pdf-lib |
| fflate | MIT | https://github.com/101arrowz/fflate |

Lucide 许可原文：`resources/licenses/lucide-ISC.txt`。opencc-js 许可原文：`resources/licenses/opencc-js-MIT.txt`。sharp 许可原文：`resources/licenses/sharp-Apache-2.0.txt`。pdf-lib 许可原文：`resources/licenses/pdf-lib-MIT.md`。fflate 许可原文：`resources/licenses/fflate-MIT.txt`。libvips 为动态链接的预编译运行时，许可与组件清单见 `@img/sharp-libvips-*` 包内 README。

## Artwork

- 应用主图标由用户提供，保存在 `build/icon-source.png`；派生的 `build/icon.icns`、`build/icon.ico` 与 `resources/icons/app-icon*.png` 仅用于毛趣萌仔桌面应用。

## Not included

- Filee 的品牌名、Logo、截图、图标与界面素材未引入。
- Daozai 仅参考产品思路与外部服务接入方式，未复制其代码。
