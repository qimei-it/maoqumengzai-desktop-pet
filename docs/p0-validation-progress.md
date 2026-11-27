# P0 技术验证进度

日期：2026-11-19。本文只保留**当前结论、证据入口与未验证项**；2026-11-19 之前的逐条流水记录见 git 历史，开发期的窗口原型、实施交接与验收矩阵已移到 [archive](archive/)。

验证原则：真实系统、真实账户、真实文件与真实窗口优先；构建成功、模拟结果或其他项目的记录不替代本项目的验收。每项证据记录系统版本、操作、结果与限制。

## 当前结论

| 模块 | 结论 | 证据 |
| --- | --- | --- |
| 桌面窗口与面板 | macOS arm64 的透明窗口、鼠标穿透、拖动、轮盘、面板懒加载、待办面板放大与恢复默认尺寸已通过自动化与部分真实窗口验证 | [窗口原型（归档）](archive/p0-window-prototype.md)、`lazy-panels`、`panel-independence`、`todo-tags` |
| 格式转换 | 图片、PDF、Office、文档、OFD、音视频、ZIP/7Z/TAR/TGZ/GZ/BZ2/XZ 与 RAR 解压在 macOS 完成真实样例；RAR 创建不纳入 | [资源预算](research/resource-budget.md) |
| 邮件 | QQ、163、Gmail 真实授权、收件、正文、附件、发送与 Gmail 代理通过；草稿自动保存/继续编辑/删除已覆盖 E2E | `mail-panel`、[Gmail 代理](research/mail-gmail-proxy.md) |
| 音乐 | QQ 音乐、网易云、Apple Music、酷狗均可接管；歌词、封面、AI 文案与资源占用已量测 | [音乐 AI](research/music-ai.md)、[资源预算](research/resource-budget.md) |
| 智能体 | DeepSeek 与火山方舟真实对话、模型列表、工具调用、审批、技能安装可用；技能安装的网络拦截问题已修复 | [智能体 Harness](research/agent-harness.md)、`agent-tools` |
| 数据边界 | 智能体对话、音乐、图像生成（MiniMax + 火山）与技能安装完成请求体级复核；163 邮件完成连接目标级复核 | [数据边界](research/data-boundary.md) |
| 资源预算 | 空闲、格式转换、音乐、智能体、邮件同步、通知场景均已完成 CPU / 内存 / 磁盘量测 | [资源预算](research/resource-budget.md) |
| 备份与更新 | 自动备份/导出/恢复 E2E 通过；1.0.0 → 1.0.1 真实升级回归通过 | [1.0.1 发布记录](release/v1.0.1.md) |
| 无障碍 | `a11y`、对比度、设计 token、图标检查通过；人工核验未完成 | [无障碍审计](research/accessibility-audit.md) |
| 发布 | 域名、Let's Encrypt 证书、Nginx vhost、`latest.json` 与两个安装包已上线；官网页面未部署，1.0.1 安装包落后于源码 | [发布记录](release/v1.0.1.md)、[开源审计](release/open-source-audit.md) |

## 已完成的自动化与真实验证

- 2026-11-27：火山方舟截图中的 16 个型号完成核对；本机真实账户 13 个型号完成对话及模拟工具循环，3 个请求返回 404 的旧型号按用户要求移除，详见 [方舟模型核验](research/volcano-models-2026-11-27.md)。
- 2026-11-27：1.0.9 更新弹窗在 macOS arm64 运行 `tests/unit/updater.test.ts`、`tests/unit/update-manifest.test.ts`、`tests/unit/app-version.test.ts` 和 `update-dialog` / `update-row` 定向 Electron 用例，覆盖下载进度、取消、重试及安装入口；下载和安装交互使用模拟数据，未完成双平台真实安装升级回归。
- 单元测试覆盖调度、清单/标签、提醒文案、邮件验证码、数据快照、技能、转换、额度提醒等模块；CI 在 Linux 上通过。
- Electron 定向用例覆盖面板懒加载、面板独立、宠物多形象与素材清理、待办标签右键菜单、待办窗口放大、草稿、邮件、备份、恢复、本地数据清除、时钟跳变、时区、免打扰、番茄钟三阶段、无障碍。
- 真实账户：QQ、163、Gmail 收发；真实 Key：DeepSeek、火山方舟、MiniMax；真实播放器：四款本地音乐客户端。
- 真实窗口：2× 内建屏 + 1× 外接屏的窗口归属、截图权限拒绝/恢复、跨午夜免打扰、1.0.0 → 1.0.1 升级。

## 未验证 / 待人工

- **Windows x64**：1.0.0/1.0.1 安装包缺少 `sharp` 原生模块、启动即崩溃（已在 1.0.2 修复并改为 Windows 构建）；安装、托盘、窗口层级、通知、拖入拖出、截图、多屏、邮件、额度、快照与转换全方向仍待验证。
- **macOS 13 Ventura**：最低系统实测。
- **macOS DMG**：安装、覆盖升级、卸载、断网首用。
- **窗口与设备**：外接屏热插拔、逐屏缩放、真实 Finder 拖出落点、合盖休眠唤醒组合。
- **无障碍**：真实壁纸观感、系统减弱动态效果/提高对比度、VoiceOver、焦点环裁切、动效手感。
- **备份**：真实窗口的自动备份状态、导出对话框、恢复重启提示。
- **休息提醒**：08:00 之后第一次久坐提醒。
- **智能体**：危险命令审批卡用真实 `shell_run` 走一遍。
- **桌宠出图**：鱼、鸟、爬宠、节肢、其他各一张 base；水族完整 6 状态。
- **邮件**：订单号、手机号、金额三类真实验证码反例；发信资源量测。
- **通知**：长时间挂机的数量与打扰观察。
- **供应商密钥**：开发版与打包版保存的 Key 互不可读，需迁移或明确提示重新保存。

## 证据索引

- 功能与资源：[资源预算](research/resource-budget.md)、[数据边界](research/data-boundary.md)、[无障碍审计](research/accessibility-audit.md)
- 模块细节：[智能体 Harness](research/agent-harness.md)、[音乐 AI](research/music-ai.md)、[桌宠生成](research/pet-generation.md)、[Gmail 代理](research/mail-gmail-proxy.md)
- 发布：[1.0.1 下载页素材](release/v1.0.1.md)、[开源审计](release/open-source-audit.md)、[发布前人工清单](release/manual-checklist.md)
- 归档：[窗口原型](archive/p0-window-prototype.md)、[实施交接](archive/v1-implementation-handoff.md)、[验收矩阵](archive/v1-acceptance-matrix.md)
