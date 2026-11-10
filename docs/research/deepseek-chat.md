# DeepSeek 智能问答接入

更新日期：2026-11-10（Asia/Shanghai）。

## 接口

- 官方文档：https://api-docs.deepseek.com/zh-cn/
- Chat Completions：`POST https://api.deepseek.com/chat/completions`
- 模型：`deepseek-flash`（DeepSeek-V4.1-Flash-1017）
- 认证：`Authorization: Bearer <API Key>`
- 请求关闭思考模式：`thinking: { "type": "disabled" }`，非流式返回
- 输出上限 1600 tokens，超时 60 秒

## 本地实现

- `src/shared/deepseek.ts`：纯请求层，便于用本地 HTTP mock 做单元测试；不接触密钥存储
- `src/main/ai-key.ts`：API Key 使用 Electron `safeStorage` 加密后写入 `mqmz.ai.json`（文件权限 0600）；加密不可用时才退化为同权限的本地明文，并继续只留在本机
- `src/main/index.ts`：在 Electron 主进程发请求，密钥不下发到任何渲染窗口
- `src/renderer/AskPanel.vue`：第六个轮盘扇区“智能问答”的面板；未配置时显示连接页，已配置后显示文件上下文与对话
- 拖入的文本文件（txt/md/csv/json/代码等）最多读取 16 个，单文件 12k、总计 40k 字符；文件内容只在用户点击发送时拼入请求，不后台预上传
- 不配置 Key 时不产生任何外部请求；错误按 401/402/429/5xx 映射为可读提示

## 验证

- 2026-11-10：本地 mock 验证请求体（model / thinking / messages / Authorization）、401、402、503、空返回共 4 项单元测试
- 2026-11-10：真机拖文件到第六扇区打开面板；保存测试 Key 后本机文件以 `enc:` 前缀加密保存，重启后仍显示已配置
- 2026-11-10：真实请求 `https://api.deepseek.com/chat/completions` 使用无效 Key，返回 401 并在界面显示“API Key 无效”，确认网络与错误映射可用
- 未完成：有效 DeepSeek Key 的真实问答、延迟与用量核对，需要用户在本机配置自己的 Key
