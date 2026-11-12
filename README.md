# maoqumengzai-desktop-pet
“毛趣萌仔”桌面端情感陪伴宠物，支持 macOS 与 Windows 操作系统，作为“毛趣映画”微信小程序的附属产品

## 第一版实施资料

- [需求基线、实施清单与 Agent 交接](docs/v1-implementation-handoff.md)
- [开源策略与功能开放边界](docs/open-source-strategy.md)
- [P0 技术验证进度](docs/p0-validation-progress.md)
- [双平台支持矩阵](docs/platform-support-matrix.md)
- [技术方案](docs/technical-architecture.md)
- [57 项验收映射](docs/v1-acceptance-matrix.md)
- [透明窗口与交互原型：运行及验证记录](docs/p0-window-prototype.md)
- [与小程序统一的面板样式规范](docs/design/panel-style-contract.md)
- [Lucide 与 Firefox Emoji 图标规范](docs/design/icon-system.md)
- [默认宠物参考图](docs/references/README.md)
- [歌词 API 调研与样例实测](docs/research/lyrics-api-evaluation.md)
- [DeepSeek 智能问答接入](docs/research/deepseek-chat.md)

当前已实现 P0 第 3 项的 Electron + Vue 透明窗口验证原型，完整首版仍按验收清单推进。项目标识统一使用 `mqmz`。Git 提交与双远端推送规范见 [AGENTS.md](AGENTS.md)。

## 开源与功能边界

本项目只维护一条公开开源的客户端代码线，按能力分层开放，不拆分“开源版 / 闭源版”两个安装包：

- 本地功能（桌宠、提醒、待办、置物架、剪贴板、截图、文件转换、音乐与歌词、邮箱收件）无需账号，离线可用。
- 宠物档案与云端同步需要绑定毛趣映画账户。
- 交友广场仅对已绑定账户开放，并移出首个公开开源版本；后续开放由服务端运营开关控制。

客户端不存放任何密钥，接口地址按公开信息对待；账号、设备会话、资源归属与限流全部由服务端校验。完整决策与发布检查见 [开源策略与功能开放边界](docs/open-source-strategy.md)。

## 本地运行

使用 Node.js 24 或更新版本及 npm，在图形桌面会话中运行：

```sh
npm ci
node node_modules/electron/install.js
npm run dev
```

macOS 开发模式启动前会执行 `scripts/set-dev-app-name.mjs`，把本地 Electron 开发包名称补成“毛趣萌仔”，让 Dock 和 Command+Tab 不再显示 Electron；打包应用使用 `productName`，不受影响。

生产渲染入口使用 `npm run build` 后运行 `npm start`。默认只显示桌宠交互标记；单击或投递文件后，在标记旁显示文件置物架，文件接收即持久化，按住文件本身拖出，可格式转换、另存副本或移出置物架；播放音乐时显示封面、标题和当前歌词的控制栏，可在设置中切换单行药丸或双行样式；鼠标停留在宠物中心会展开番茄时钟、喝水提醒、待办清单和智能体轮盘；置物架齿轮、macOS 菜单栏或托盘可打开设置面板。图片转换已接入 JPG / PNG / WEBP，并支持图片转 PDF、PDF 合并与拆分、批量重命名、ZIP 打包/解压和图片压缩；Office 与音视频仍待后续阶段；正式角色素材仍待制作。大型验证台仅为开发诊断入口，打包版本不会创建它。测试命令为 `npm test`、`npm run test:e2e`，具体实测范围和人工检查步骤见原型记录。
