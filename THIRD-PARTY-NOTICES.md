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
| pdf-to-img | MIT | https://github.com/k-yle/pdf-to-img |
| pdfjs-dist（PDF.js） | Apache-2.0 | https://github.com/mozilla/pdf.js |
| @napi-rs/canvas | MIT | https://github.com/Brooooooklyn/canvas |
| bmp-js | MIT | https://github.com/shaozilee/bmp-js |
| marked | MIT | https://github.com/markedjs/marked |
| heic-decode | ISC | https://github.com/catdad-experiments/heic-decode |
| libheif-js（HEIC 解码） | LGPL-3.0 | https://github.com/catdad-experiments/libheif-js |
| easyofd | Apache-2.0 | https://www.npmjs.com/package/easyofd |
| 7zip-min | MIT | https://github.com/egorfi/7zip-min |
| 7zip-bin（7-Zip 二进制） | MIT 包；7-Zip 本体 LGPL + unRAR 限制 | https://github.com/develar/7zip-bin |
| node-unrar-js | MIT；unRAR 源码许可 | https://github.com/YuJianrong/node-unrar.js |
| FFmpeg（可选下载） | 见下方说明 | https://ffmpeg.org/ |

Lucide 许可原文：`resources/licenses/lucide-ISC.txt`。opencc-js 许可原文：`resources/licenses/opencc-js-MIT.txt`。sharp 许可原文：`resources/licenses/sharp-Apache-2.0.txt`。pdf-lib 许可原文：`resources/licenses/pdf-lib-MIT.md`。fflate 许可原文：`resources/licenses/fflate-MIT.txt`。pdf-to-img 许可原文：`resources/licenses/pdf-to-img-MIT.txt`；PDF.js 许可原文：`resources/licenses/pdfjs-Apache-2.0.txt`；@napi-rs/canvas 许可原文：`resources/licenses/napi-rs-canvas-MIT.txt`；bmp-js 许可原文：`resources/licenses/bmp-js-MIT.txt`；marked 许可原文：`resources/licenses/marked-MIT.md`；heic-decode 许可原文：`resources/licenses/heic-decode-ISC.txt`；libheif-js 许可原文：`resources/licenses/libheif-js-LGPL-3.0.txt`。easyofd 许可原文：`resources/licenses/easyofd-Apache-2.0.txt`；7zip-min 许可原文：`resources/licenses/7zip-min-MIT.txt`；7zip-bin 许可原文：`resources/licenses/7zip-bin-LICENSE.txt`；node-unrar-js 许可原文：`resources/licenses/node-unrar-js-MIT.md`。easyofd 随附的 JSZip、X2JS、opentype.js 与 JB2 组件按各自上游许可使用。libvips 为动态链接的预编译运行时，许可与组件清单见 `@img/sharp-libvips-*` 包内 README。

FFmpeg 不随安装包分发，由用户手动在设置中下载。当前可选源为 npmmirror 镜像的 `ffmpeg-static` b6.1.1 静态构建（macOS arm64/x64、Windows x64），安装前校验固定 SHA-256。该构建的配置包含 `--enable-gpl --enable-nonfree`；正式发行前需替换为可再分发构建或单独确认许可，并向用户展示对应 FFmpeg 许可证。

## Artwork

- 应用主图标、7z 文件图标与通用归档文件图标由用户提供；文件图标保存在 `src/renderer/assets/file-icons/7z.svg` 与 `archive.svg`。应用主图标保存在 `build/icon-source.png`；派生的 `build/icon.icns`、`build/icon.ico` 与 `resources/icons/app-icon*.png` 仅用于毛趣萌仔桌面应用。
- 待办清单图标使用 Mozilla FxEmojis（https://github.com/mozilla/fxemoji）的官方 SVG，保存在 `src/renderer/assets/fxemoji/`，清单与中文名称见同目录 `manifest.json`。视觉设计采用 CC BY 4.0，代码采用 Apache-2.0；仅移除未使用的内嵌字体与文本元数据，图形路径未改动。许可证原文：`resources/licenses/fxemoji-LICENSE.md`。

## Not included

- Filee 的品牌名、Logo、截图、图标与界面素材未引入。
- Daozai 仅参考产品思路与外部服务接入方式，未复制其代码。
