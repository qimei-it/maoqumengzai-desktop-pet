# 参与开发

感谢你愿意修改毛趣萌仔。这个项目以 Electron + Vue 3 + TypeScript 构建，主进程负责窗口、托盘、提醒与格式转换，渲染层是一个按需加载面板的单页应用。

## 环境

- Node.js 24 或更新版本
- macOS 13+（开发 macOS 相关功能）或 Windows 10 22H2 / 11（开发 Windows 相关功能）
- 可用的图形桌面会话：桌宠、托盘与提醒需要真实窗口

```sh
npm ci
node node_modules/electron/install.js
npm run dev
```

`npm ci` 会安装 `sharp` 与 `@napi-rs/canvas` 等原生依赖，它们按当前平台安装对应二进制。要打 Windows 包请到 Windows 上构建，或用仓库里的 `Build Windows` 工作流。

## 提交之前

按改动范围跑对应检查，不要不加区分地跑全量：

| 改动面 | 检查 |
| --- | --- |
| 任意 TypeScript | `npm run typecheck` |
| 单一模块逻辑 | 对应的 `tests/unit/*.test.ts` |
| 窗口与面板生命周期 | `lazy-panels`、`panel-independence`、`agent-window-restore` |
| 番茄钟与提醒 | `focus-badge`、`recovery`、`todo-reminder-bubble` |
| 样式与配色 | `npm run check:design`、`npm run check:contrast`、`a11y` |
| 图标 | `npm run check:icons` |

## 约定

- 提交信息用单行：`feat: 新增…`、`fix: 修复…`、`docs: 补充…`，一次提交只表达一件事。
- 窗口间距、圆角与字阶沿用 `src/renderer/styles/tokens.css` 里的设计 token；桌面端语义色在 `desktop-tokens.css` 覆盖。组件里写语义变量，不要写裸色值。
- 图标使用 Lucide SVG 或 Firefox Emoji，来源写进 `docs/design/icon-system.md`；不要手绘近似路径或字符图标。
- 界面上每行只表达一个信息：标题、标签、按钮下不再叠一行小字说明，解释放到 tooltip 或帮助页。
- 文案只写动作与结果，不写“这里可以……”式描述。
- 交互动效用弹簧或带轻微回弹的缓出曲线，并遵循 `prefers-reduced-motion`。
- 第三方素材先确认许可，记录到 `THIRD-PARTY-NOTICES.md`。

## 流程

1. Fork 仓库，从 `main` 切出分支。
2. 完成改动并跑对应检查。
3. 开 Pull Request，说明改动动机、影响范围与验证方式；涉及界面的改动附截图。
4. 合并后由维护者在发布时打 tag 并更新 `CHANGELOG.md`。

安全问题不要开公开 Issue，见 [SECURITY.md](SECURITY.md)。
