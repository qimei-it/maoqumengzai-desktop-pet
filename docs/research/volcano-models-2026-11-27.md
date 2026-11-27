# 火山方舟截图模型接入核验

日期：2026-11-27（Asia/Shanghai）。以下模型名称对应用户提供的六张截图；模型 ID 与思考参数依据[火山方舟模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=en)、[深度思考](https://docs.volcengine.com/docs/ark/deep-thinking?lang=en)和[模型下线公告](https://docs.volcengine.com/docs/ark/model-deprecation-notice?lang=en)。

## 模型与真实连接结果

使用本机已保存的方舟凭据，向每个模型发起简短对话；成功的模型再各执行一次无副作用的模拟工具调用并继续回复。表中结果仅反映本次账户与测试时间，不代表其他账户或后续服务状态。

| 截图模型 | 方舟模型 ID | 本次结果 |
| --- | --- | --- |
| Kimi-K3.1-Pro | `kimi-k3-1-pro-261024` | 对话与工具循环通过 |
| DeepSeek-V4.1-Flash经济版 | `deepseek-v4-1-flash-economy-261017` | 对话与工具循环通过 |
| Doubao-Seed-2.1-lite | `doubao-seed-2-1-lite-260915` | 对话与工具循环通过 |
| DeepSeek-V4.1-Flash | `deepseek-v4-1-flash-261017` | 对话与工具循环通过 |
| GLM-5.3-Flash | `glm-5-3-flash-260828` | 对话与工具循环通过 |
| DeepSeek-V4-Pro正式版 | `deepseek-v4-pro-ga-260813` | 对话与工具循环通过 |
| DeepSeek-V4-Flash正式版 | `deepseek-v4-flash-ga-260731` | 对话与工具循环通过 |
| GLM-5.2 | `glm-5-2-260617` | 对话与工具循环通过 |
| Doubao-Seed-Evolving | `doubao-seed-evolving` | 对话与工具循环通过 |
| Doubao-Seed-2.1-turbo | `doubao-seed-2-1-turbo-260628` | 对话与工具循环通过 |
| Doubao-Seed-2.0-mini | `doubao-seed-2-0-mini-260428` | 对话与工具循环通过 |
| Doubao-Seed-2.0-lite | `doubao-seed-2-0-lite-260428` | 对话与工具循环通过 |
| Doubao-Seed-2.1-pro | `doubao-seed-2-1-pro-260915` | 对话与工具循环通过 |
| DeepSeek-V4-pro | `deepseek-v4-pro-260425` | 模型列表未返回；实际请求返回 404（模型不存在或无权访问） |
| Doubao-Seed-2.0-Code | `doubao-seed-2-0-code-preview-260215` | 模型列表未返回；实际请求返回 404（模型不存在或无权访问） |
| Doubao-Seed-2.0-pro | `doubao-seed-2-0-pro-260215` | 模型列表返回，但实际请求返回 404（模型不存在或无权访问） |

三个请求失败的旧版本均出现在官方下线或迁移公告中；不要将接口返回的模型列表当作账户已开通的证明，也不要把替代型号冒充原型号。用户随后要求移除这三个方舟型号，当前目录仅保留其余 13 个文本型号；独立 DeepSeek 供应商的同名型号不受影响。

## 实现与验证

- 13 个真实测试通过的文本模型注册为火山方舟供应商模型；已删除的旧方舟型号只用于历史设置及会话迁移，不再出现在模型列表中。其他供应商的同名型号不受影响。
- Kimi-K3.1-Pro 和 GLM-5.3-Flash 始终启用思考；Kimi 请求不发送 `thinking` 字段。方舟返回的 `encrypted_content` 在同模型后续工具请求中原样回传，切换模型或供应商时移除。
- 方舟模型、旧会话及设置迁移等 7 个定向单元测试文件共 111 项通过；`tests/e2e/volcano-models.spec.ts` 循环验证 13 个保留型号的设置、切换、Key 测试模型列表过滤，以及独立 DeepSeek 同名模型仍可选择。界面测试使用模拟模型列表。
- `agent-panel.spec.ts` 对应的既有宠物创建用例此前单独运行通过；与新用例合跑时出现窗口提前关闭和 worker 退出超时，重试通过但整次运行被 Playwright 标为失败。模型过滤专项用例随后独立复核通过。
- 真实连接与界面验证在 macOS arm64 开发环境完成；Windows 实机未验证，也未执行全量测试或打包。
