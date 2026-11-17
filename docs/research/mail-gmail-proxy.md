# Gmail 代理与邮件剩余项（macOS）

日期：2026-11-17。目标是让 Gmail 在打包版、从 Finder 启动且没有终端环境变量时，仍然能通过 macOS 系统代理收件、读正文和发送带附件邮件。

## 问题

测试网络里 `imap.gmail.com:993` 与 `smtp.gmail.com:465` 曾直连超时。系统环境里已有代理：

- `all_proxy=socks5://127.0.0.1:6153`
- `https_proxy=http://127.0.0.1:6152`

应用原先把代理留给系统，但 Node 的 IMAP/SMTP 连接不会自动使用环境代理；而且从 Finder 启动的打包应用继承的是 launchd 环境，读不到 shell 里设置的 `all_proxy`。结果 Gmail 账户变成：

```text
无法连接邮箱服务器（ETIMEDOUT），请检查网络或代理。
```

## 实现

### 代理选择

`src/main/mail-proxy.ts` 现在的优先级是：

1. 设置页手动代理；
2. 环境变量 `MQMZ_MAIL_PROXY`、`ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY`（保留给开发和 CI）；
3. macOS 系统代理；
4. 直连。

系统代理由主进程调用 `session.defaultSession.resolveProxy('https://imap.gmail.com:993')` 获取，能识别 HTTP/SOCKS 系统代理、PAC 和代理例外列表；返回值如 `PROXY 127.0.0.1:6152; DIRECT` 会解析成 `http://127.0.0.1:6152`。系统代理在启动、保存设置、Gmail 同步、账户探测和发信前刷新。

`src/main/mail-sync.ts` 把代理传给 ImapFlow，`src/main/mail-smtp.ts` 通过 `getSocket` 建立隧道后交给 Nodemailer；QQ/163 继续直连。

### 设置页

设置 → 邮件客户端，账户区域下方新增两项，位于「同步间隔」上方：

- **Gmail 代理**：`自动（系统）` / `手动` / `直连`，默认自动。
- **代理地址**：仅手动模式显示，失焦或回车保存，校验 HTTP/HTTPS/SOCKS 协议与地址格式。

### 配置迁移

`mqmz.mail.json` 升到 `version: 2`，新增 `proxyMode` 与 `proxyUrl`；读取 v1 文件时补齐默认值，不重置同步间隔、通知、缓存保留等已有设置。

### 打包修复

打包版首次启动时报 `Cannot find module 'postcss'`：`electron-builder.yml` 为压缩体积排除了 `postcss`、`nanoid`、`source-map-js`、`entities`，但 `sanitize-html` 在运行时需要它们。已移除这些排除项，重新打包后应用可正常启动。

## 真实验证

环境：macOS 27.0.1 arm64，系统代理 HTTP `127.0.0.1:6152`、SOCKS5 `127.0.0.1:6153`；使用 `npm run pack:mac` 生成 `dist/毛趣萌仔-0.0.1-arm64.dmg`，安装到 `/Applications`。

1. 从 Finder/`open -a` 启动，进程环境里没有 `ALL_PROXY`、`HTTPS_PROXY`、`MQMZ_MAIL_PROXY` 或 `MQMZ_DATA_DIR`。
2. 打包版主进程的 `session.resolveProxy('https://imap.gmail.com:993')` 返回 `PROXY 127.0.0.1:6152`。
3. 用不存在的 Gmail 账户与假应用专用密码触发连接探测：2.7 秒内返回「授权码或应用专用密码不正确」，说明 IMAP 已经通过系统代理解析到 Gmail 并完成认证阶段；代理错误时不会出现该结果。
4. 真实 Gmail 账户在打包版中同步成功，状态 `ready`，收件箱 23 封、18 封未读；打开列表首封邮件，正文 13,341 字符且 HTML 正常。
5. 打包版向账户自身发送纯文本邮件，返回「邮件已发送」；随后发送带 `mqmz-mail-attachment.txt` 的邮件，同样返回「邮件已发送」，已发送文件夹追加成功。
6. 设置页显示 `Gmail 代理 = 自动（系统）`；切换到手动并保存 `http://127.0.0.1:6152` 后，`mqmz.mail.json` 写入 `proxyMode: manual` 与对应地址；切回自动后恢复 `proxyMode: auto`。
7. 首次从 Finder 启动时出现一次「毛趣萌仔 Safe Storage」钥匙串授权提示，授权后正常启动；这是首次启动时的一次性授权行为。

测试：`mail-proxy`、`mail`、`mail-sync`、`mail-smtp` 定向单测 48 项通过；`npm run typecheck`、`npm run check:design`、`npm run check:icons` 通过；`prototype.spec.ts -g "邮件客户端设置可添加账户并调整偏好"` 通过；`mail-panel.spec.ts` 6 项通过（其中 Tab 缩进断言首次偶发失败，单独重跑通过）。

## 限制

- 本次网络在「直连」模式下也能连上 Gmail，因此不能靠直连失败来反证代理生效；代理路径由 `resolveProxy` 返回值、手动代理配置和单元测试共同确认。
- 打包版仍只对 Gmail 使用代理；QQ/163 保持直连。
- Windows x64 的系统代理读取、Gmail 收件与发送仍未验证。
- 首次访问 `safeStorage` 会触发一次钥匙串授权。
