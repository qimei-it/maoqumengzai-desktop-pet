# Gmail 代理与邮件剩余项（macOS）

日期：2026-11-13。目标是把 macOS 邮件与额度里仍标为待验证的项收尾：Gmail 全链路、126 地址支持和额度验证记录。

## 问题

测试网络可以直连 QQ/163 邮件服务器，但 `imap.gmail.com:993` 与 `smtp.gmail.com:465` 直连超时。系统环境里已有代理：

- `all_proxy=socks5://127.0.0.1:6153`
- `https_proxy=http://127.0.0.1:6152`

应用原先把代理留给系统，但 Node 的 IMAP/SMTP 连接不会自动使用环境代理，因此 Gmail 账户状态变成：

```text
无法连接邮箱服务器（ETIMEDOUT），请检查网络或代理。
```

## 实现

新增 `src/main/mail-proxy.ts`：

- 读取代理地址，优先级：`MQMZ_MAIL_PROXY` → `ALL_PROXY` / `all_proxy` → `HTTPS_PROXY` / `https_proxy` → `HTTP_PROXY` / `http_proxy`。
- 支持 SOCKS5（`socks` 包）和 HTTP/HTTPS CONNECT。
- `createProxySocket()` 返回未经 TLS 的隧道 socket；SMTP 交给 Nodemailer 自己升级 TLS，避免双重 TLS。

接入：

- `src/main/mail-sync.ts`：Gmail 的 ImapFlow 连接传入 `proxy`，用于同步、详情、附件和追加已发送。
- `src/main/mail-smtp.ts`：Gmail 的 SMTP 传输传入 `getSocket`，通过代理建立隧道后由 Nodemailer 完成 TLS。
- QQ/163 仍然直连，不走代理，避免国内邮箱被代理绕行。
- `socks@2.8.10` 加入直接依赖，打包时随应用分发。

126 地址沿用 163 服务商预设，但按邮箱域名选择服务器：

- `name@126.com` → `imap.126.com:993` / `smtp.126.com:465`
- `name@163.com` → `imap.163.com:993` / `smtp.163.com:465`
- 163 的 IMAP ID 逻辑同样适用于 126。

## 真实验证

环境：macOS 27.0.1 arm64，测试 Gmail 账户，代理 `socks5://127.0.0.1:6153`。

1. Gmail 账户状态从 `error` 恢复为 `ready`，收件箱 9 封、6 封未读；文件夹同步正常。
2. 发送纯文本测试邮件到同一 Gmail 地址，返回 `邮件已发送`。
3. 打开 Gmail 收件箱，收到测试邮件；正文读取正常。
4. 发送带附件 `mqmz-mail-attachment.txt` 的测试邮件，返回 `邮件已发送`。
5. 重新同步收件箱，打开带附件邮件，附件元数据正确；附件缓存并保存到邮件缓存目录。
6. 126 服务器选择由单元测试覆盖；没有 126 真实账户，仍未做真实授权验证。

## 额度现状

- OpenAI Codex：真实读取 `plus`，5 小时 100%、本周 40%，额度药丸显示正常。
- DeepSeek：本地 Key 已配置，官方余额接口真实返回人民币余额（当前约 ¥17.12），额度药丸显示正常。
- Claude：本机没有 `claude` CLI，也没有 `~/.claude` 登录信息；Claude 订阅额度仍需要安装并登录 Claude Code 后才能读取，当前不作为已完成项。

## 限制

- 代理目前来自环境变量；从 Finder 启动的打包应用可能没有这些变量，后续可增加设置页代理字段或读取 macOS 系统代理。
- Gmail 的 SMTP 走 SOCKS/HTTP 隧道，仍依赖代理稳定性和 Gmail 应用专用密码。
- 126 真实账户、Windows 邮件与额度、Claude 额度仍待外部条件。
