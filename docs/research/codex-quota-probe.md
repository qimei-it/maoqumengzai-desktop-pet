# OpenAI / Codex 订阅额度读取验证

日期：2026-11-09（Asia/Shanghai）。本记录只描述本机真实读取路径，不包含邮箱、Token 或其他账户凭据。

## 结论

本机已安装 `codex-cli 0.156.1` 并使用本地登录状态时，可以通过 `codex app-server` 的 JSON-RPC 方法 `account/rateLimits/read` 读取订阅额度，无需 OpenAI API Key。本轮已真实返回计划类型、两个额度窗口、已用百分比和重置时间。

`account/read` 同时会返回账户邮箱；接入产品时只取 `planType`，不展示、不记录邮箱。

## 调用方式

```text
codex app-server
→ {"id":1,"method":"initialize","params":{"clientInfo":{"name":"…","version":"…"},"capabilities":{"experimentalApi":true}}}
→ {"id":2,"method":"initialized"}
→ {"id":3,"method":"account/read","params":{}}
→ {"id":4,"method":"account/rateLimits/read","params":{}}
→ {"id":5,"method":"account/usage/read","params":{}}
```

通信为换行分隔的 JSON，运行在 stdio 上；`generate-json-schema` 显示协议版本包含 v2 方法：

- `account/rateLimits/read` → `GetAccountRateLimitsResponse`
- `account/usage/read` → 汇总字段与每日桶
- `account/rateLimitResetCredit/consume`、`account/sendAddCreditsNudgeEmail` 等写操作不接入。

可复现脚本：[probe-codex-quota.mjs](../../scripts/probe-codex-quota.mjs)。

## 本机实测结果（2026-11-09）

| 字段 | 实际值 |
| --- | --- |
| Codex CLI | 0.156.1 |
| 平台 | macOS 27.0.1，arm64 |
| 计划类型 | `plus` |
| 主窗口 | 300 分钟（5 小时），已用 65% |
| 次窗口 | 10080 分钟（7 天），已用 54% |
| 重置时间 | 两个窗口均返回 Unix 时间戳 |
| 附加额度 | `hasCredits: false`，`balance: "0"`，`unlimited: false` |
| 累计用量 | 生命周期 4,879,235,922 tokens；连续 29 天 |

未记录 `account/read` 返回的邮箱，也未输出任何访问令牌。

## 接入要求与限制

- **依赖本机 Codex 客户端**：需要存在已登录的 Codex CLI。未安装、未登录、登录过期时，产品应显示“已安装但未登录 / 登录已过期”，不能显示为零额度。
- **协议属于客户端内部接口**：字段以本版本 schema 为准，升级后可能变化。产品侧应校验字段、保留原始错误并在解析失败时降级，不把未知结构当成“无额度”。
- **超时与并发**：本轮观察到启动后模型列表刷新可超时，但不影响额度读取；产品应设置独立超时、串行查询，并在失败时保留上次成功值（标注时间）。
- **启动成本**：每次查询需拉起 `app-server` 进程；应复用单个进程或按需短连接，不能长期占用。
- **范围**：此接口只证明 Codex 订阅额度；不能据此推断全部 ChatGPT 功能额度，也不覆盖 Claude。
- **平台**：Windows 路径与进程管理尚未验证；需要 Windows 测试机安装同版本 Codex 后按同一脚本复验。

## 与产品需求的对应

本轮仅完成 OpenAI/Codex 一条接入验证。Claude 仍缺安装环境，DeepSeek 余额需要用户本地填写 API Key 后才能调用真实接口；两者保持待验证。UI 需要区分“未登录 / 读取失败 / 额度为零”三种状态。
