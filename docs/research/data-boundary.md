# 外部服务数据边界

日期：2026-11-17
对应验收项：H-P4-06

本文记录客户端会联网的位置、发送内容、落盘缓存与日志行为，用于证明「本地数据默认不上传」。

## 1. 进程边界

所有出站请求都从**主进程**发起，渲染进程没有网络出口：

`src/main/index.ts` 在启动时对默认 session 注册 `onBeforeRequest`，取消一切 `http://`、`https://`、`ws://`、`wss://` 请求，唯一例外是开发服务器的 `127.0.0.1:5173`。被拦截的请求会计入快照的 `blockedRequests` 计数。

因此界面无法直接向任何第三方发请求；每个联网行为都必须经过主进程里显式写出的调用点。

## 2. 出站请求清单

| 功能 | 目标 | 方法 | 发送内容 | 触发条件 |
| --- | --- | --- | --- | --- |
| 智能体对话 | `api.deepseek.com/chat/completions` | POST | 会话消息、系统提示词（含桌宠名字/种类/用户填写的提示词）、工具定义 | 用户自己填 DeepSeek Key 并发送消息 |
| 模型列表 | `api.deepseek.com/models` | GET | 无 | 校验 Key |
| DeepSeek 联网搜索 | `api.deepseek.com/v1/tools/search` | POST | 搜索查询 | 智能体调用搜索工具 |
| DeepSeek 余额 | `api.deepseek.com/user/balance` | GET | 无 | 配置了 Key 且额度显示开启 |
| OpenAI 订阅额度 | `chatgpt.com/backend-api/wham/usage` | GET | 本机登录凭证对应的 Bearer | 配置了本机 ChatGPT/Codex 登录态 |
| 图像 / 视频 / 语音生成 | `api.minimax.cn/v1/*` | POST | 提示词、参考素材 | 用户配置 MiniMax Key 并主动生成 |
| 自定义桌宠出图 | `ark.cn-beijing.volces.com/api/v3/images/generations` | POST | 提示词、参考照片（重编码为 JPEG 并去元数据） | 用户配置火山方舟 Key 并点击生成 |
| 火山方舟模型列表 | `ark.cn-beijing.volces.com/api/v3/models` | GET | 无 | 校验 Key、解析可用模型 |
| 邮件收件 / 发信 | 用户填写的 IMAP / SMTP 主机 | IMAP / SMTP | 账户凭据、邮件内容 | 用户添加并启用邮箱账户 |
| 歌词匹配 | `lrclib.net/api/*` | GET | 歌曲名、歌手、专辑、时长 | 播放音乐且本地无歌词 |
| 封面与专辑信息 | `itunes.apple.com/search` | GET | 歌曲名与歌手 | 播放音乐且缺少封面 |
| AI 音乐互动文案 | `api.deepseek.com/chat/completions` | POST | 歌曲名、歌手、风格、阶段 | 用户开启「AI 智能互动」 |
| 技能安装 | `github.com`、`codeload.github.com`、`gh-proxy.com`、`ghproxy.net`、`ghfast.top` | GET | 技能包地址 | 用户主动安装技能 |
| 应用内更新 | `mqmz.qimeistudio.com/latest.json` 与安装包 | GET | 当前版本号 | 打包版启动 15 秒后检查、或手动检查 |

没有任何请求指向自家服务端：首版不含账号、云同步与交友，客户端也没有配置云端网关地址。

## 3. 本地缓存与落盘

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 会话与消息 | `userData/agent/sessions` | 仅本机 |
| 邮件库与附件 | `userData/mail-*` | SQLite + 本地附件目录 |
| 歌词缓存 | `userData/lyrics` | 只缓存匹配结果 |
| AI 音乐文案缓存 | `userData/music-ai/` | 含生成文案与来源 |
| 生成的图片 / 视频 / 音频 | 用户选择的输出目录 | 由用户主动保存 |
| 自定义桌宠素材 | `userData/pets/<id>/` | 照片只在生成期间留在临时目录 |
| 备份快照 | `userData/snapshots/` | 排除 API Key、邮箱授权码与引擎二进制 |

## 4. 凭据

- API Key 与邮箱授权码经系统加密存储（macOS Keychain / Windows DPAPI），由 `safeStorage` 处理，不下发到渲染层。
- 凭据不进备份快照、不进日志、不进 git。
- 密钥不可用时相关认证直接停止，不回退明文存储。

## 5. 日志

- 主进程只在本地控制台输出，不写用户内容，不上报。
- 仓库里的验证记录均经过脱敏，不含真实邮件、验证码、Key 或剪贴板正文。

## 6. 实测

环境：macOS 27.0.1 arm64，2026-11-17，全新数据目录，未配置任何 Key 与邮箱账户。

```sh
# 启动后等待 14 秒，读取主进程的 TCP 连接
lsof -nP -a -p <pid> -i
```

结果：**0 条连接**。空闲状态下客户端不发起任何出站请求。

复现方法：用临时 `MQMZ_DATA_DIR` 启动开发版，配置好代理后观察上述命令；随后逐项启用功能（填 Key、加邮箱、生成图），确认只会出现上表列出的目标。

## 7. 结论与限制

- 已知联网点全部在上表；渲染层无法自行联网。
- 未做抓包级审计（tcpdump / 代理抓包）的逐请求体复核，仍属待补证据。
- 邮件附件与正文会经用户自己的 IMAP/SMTP 服务器传输，这部分由邮箱服务商处理。
