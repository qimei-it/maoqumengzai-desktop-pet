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
| qpdf | Apache-2.0 | https://github.com/qpdf/qpdf |
| fflate | MIT | https://github.com/101arrowz/fflate |
| pdf-to-img | MIT | https://github.com/k-yle/pdf-to-img |
| pdfjs-dist（PDF.js） | Apache-2.0 | https://github.com/mozilla/pdf.js |
| Nodemailer | MIT | https://github.com/nodemailer/nodemailer |
| @napi-rs/canvas | MIT | https://github.com/Brooooooklyn/canvas |
| bmp-js | MIT | https://github.com/shaozilee/bmp-js |
| marked | MIT | https://github.com/markedjs/marked |
| imapflow | MIT | https://github.com/postalsys/imapflow |
| mailparser | MIT | https://github.com/nodemailer/mailparser |
| sanitize-html | MIT | https://github.com/apostrophecms/sanitize-html |
| heic-decode | ISC | https://github.com/catdad-experiments/heic-decode |
| libheif-js（HEIC 解码） | LGPL-3.0 | https://github.com/catdad-experiments/libheif-js |
| easyofd | Apache-2.0 | https://www.npmjs.com/package/easyofd |
| 7zip-min | MIT | https://github.com/egorfi/7zip-min |
| 7zip-bin（7-Zip 二进制） | MIT 包；7-Zip 本体 LGPL + unRAR 限制 | https://github.com/develar/7zip-bin |
| node-unrar-js | MIT；unRAR 源码许可 | https://github.com/YuJianrong/node-unrar.js |
| MediaRemoteMini（macOS 正在播放读取） | BSD-3-Clause | https://github.com/kirtan-shah/nowplaying-cli |
| FFmpeg（可选下载） | 见下方说明 | https://ffmpeg.org/ |

Lucide 许可原文：`resources/licenses/lucide-ISC.txt`。opencc-js 许可原文：`resources/licenses/opencc-js-MIT.txt`。sharp 许可原文：`resources/licenses/sharp-Apache-2.0.txt`。pdf-lib 许可原文：`resources/licenses/pdf-lib-MIT.md`。fflate 许可原文：`resources/licenses/fflate-MIT.txt`。pdf-to-img 许可原文：`resources/licenses/pdf-to-img-MIT.txt`；PDF.js 许可原文：`resources/licenses/pdfjs-Apache-2.0.txt`；@napi-rs/canvas 许可原文：`resources/licenses/napi-rs-canvas-MIT.txt`；bmp-js 许可原文：`resources/licenses/bmp-js-MIT.txt`；marked 许可原文：`resources/licenses/marked-MIT.md`；imapflow 许可原文：`resources/licenses/imapflow-MIT.txt`；mailparser 许可原文：`resources/licenses/mailparser-MIT.txt`；sanitize-html 许可原文：`resources/licenses/sanitize-html-MIT.txt`；heic-decode 许可原文：`resources/licenses/heic-decode-ISC.txt`；libheif-js 许可原文：`resources/licenses/libheif-js-LGPL-3.0.txt`。easyofd 许可原文：`resources/licenses/easyofd-Apache-2.0.txt`；7zip-min 许可原文：`resources/licenses/7zip-min-MIT.txt`；7zip-bin 许可原文：`resources/licenses/7zip-bin-LICENSE.txt`；node-unrar-js 许可原文：`resources/licenses/node-unrar-js-MIT.md`；MediaRemoteMini 许可原文：`resources/licenses/mediaremote-mini-BSD-3-Clause.txt`。easyofd 随附的 JSZip、X2JS、opentype.js 与 JB2 组件按各自上游许可使用。libvips 为动态链接的预编译运行时，许可与组件清单见 `@img/sharp-libvips-*` 包内 README。

## 可选本地引擎

可选引擎不随安装包分发，由用户在设置中选择本机安装或手动下载；应用只保存路径或应用数据目录内的引擎文件，卸载时清除对应选择与临时文件，不删除系统安装。qpdf 作为内置引擎随安装包分发，源码与许可见 `resources/engines/qpdf/SOURCE.txt`。

| 组件 | 许可 | 来源 | 说明 |
| --- | --- | --- | --- |
| LibreOffice | MPL-2.0 | https://www.libreoffice.org/ | 用户选择本地 `soffice`；许可证原文：`resources/licenses/libreoffice-MPL-2.0.txt` |
| FFmpeg | LGPL-3.0 | https://ffmpeg.org/ | AgentDVR LGPL v3 构建（FFmpeg 9.0.2）；许可证与源码说明：`resources/licenses/ffmpeg-LGPL-3.0.txt`、`resources/licenses/ffmpeg-SOURCE.txt` |

FFmpeg 当前可选源为 `ispysoftware/agentdvr-ffmpeg-build` 的 LGPL v3 构建（FFmpeg 9.0.2，macOS arm64、Windows x64），安装前校验固定 SHA-256。该构建未启用 GPL、nonfree 或 libx264；macOS/Windows 使用系统硬件编码器，macOS 以动态库方式随引擎目录安装，保持可替换性。上游源码与构建来源见 `resources/licenses/ffmpeg-SOURCE.txt`。

## Bundled skills

`resources/skills` 内置论文科研、文档办公与通用工具类 Agent Skills，来源、固定 commit 与许可证见 `resources/skills/SOURCES.md`，许可证原文保存在 `resources/skills/licenses/`。

| 来源 | 许可 | 数量 | 说明 |
| --- | --- | --- | --- |
| k-dense-ai/scientific-agent-skills | MIT | 177 | 仅文本与代码文件，排除二进制模板、图片与媒体 |
| Yuan1z0825/nature-skills | Apache-2.0 | 24 | 仅文本与代码文件，排除二进制模板、图片与媒体 |
| blader/humanizer | MIT | 1 | 单 Skill 仓库 |
| anthropics/skills | Apache-2.0 | 18 | 逐 Skill 许可；无许可的 doc-coauthoring 未内置 |
| getsentry/skills | Apache-2.0 | 1 | skill-scanner |
| vercel-labs/skills | MIT | 1 | find-skills |
| yejinlei/web-search-skill | MIT | 1 | web-search |
| citrolabs/ego-lite | MIT | 1 | ego-browser |

Supervisor-Skills（CC BY-NC-SA 4.0）与 academic-research-skills-codex（CC BY-NC 4.0）因非商业许可暂未内置；paper-qa 仓库不含 `SKILL.md`，未作为 Skill 内置。

## Artwork

- 应用主图标、7z 文件图标与通用归档文件图标由用户提供；文件图标保存在 `src/renderer/assets/file-icons/7z.svg` 与 `archive.svg`。应用主图标保存在 `build/icon-source.png`；派生的 `build/icon.icns`、`build/icon.ico` 与 `resources/icons/app-icon*.png` 仅用于毛趣萌仔桌面应用。
- 音频、视频、Markdown 与 Office 文件类型图标由用户提供，保存在 `src/renderer/assets/file-icons/`；其中 Word、Excel、PowerPoint 图标使用 Microsoft 文件类型识别样式，相关标识归 Microsoft 所有，仅用于本地文件类型识别。
- Pages、Keynote、Numbers 文件类型图标由用户提供的 macOS 应用 `.icns` 图标转换为 PNG，保存在 `src/renderer/assets/file-icons/pages.png`、`keynote.png`、`numbers.png`；Apple、Pages、Keynote、Numbers 标识归 Apple Inc. 所有，仅用于本地文件类型识别。
- 待办清单图标使用 Mozilla FxEmojis（https://github.com/mozilla/fxemoji）的官方 SVG，保存在 `src/renderer/assets/fxemoji/`，清单与中文名称见同目录 `manifest.json`。视觉设计采用 CC BY 4.0，代码采用 Apache-2.0；仅移除未使用的内嵌字体与文本元数据，图形路径未改动。许可证原文：`resources/licenses/fxemoji-LICENSE.md`。
- OpenAI 服务标识来自 LobeHub Icons（https://github.com/lobehub/lobe-icons，MIT，Copyright (c) 2023 LobeHub），保存在 `src/renderer/OpenAiMark.vue`，仅用于识别 OpenAI 额度药丸；未使用其品牌名以外的素材。

## Not included

- Filee 的品牌名、Logo、截图、图标与界面素材未引入。
- Daozai 仅参考产品思路与外部服务接入方式，未复制其代码。
