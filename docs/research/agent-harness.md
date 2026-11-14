# 智能体 Harness（方案 A）

更新日期：2026-11-13。首版原生轻量 Harness，不嵌入 OpenCode 运行时。

## 结构

```text
AgentPanel（view=agent，920×640 可缩放）
  ↓ command / Snapshot 广播
Agent Runtime（src/main/agent/runtime.ts）
  ├─ provider.ts   DeepSeek 流式 + tool_calls
  ├─ store.ts      会话持久化
  ├─ tools.ts      工具注册与执行
  └─ 权限、审批、取消、用量、上下文裁剪
  ↓
Services（src/main/services/contracts.ts，结构化返回）
  ├─ shelf / convert / archive / rename
  ├─ todo / mail / music / settings / clipboard / focus
  ├─ shell（独立实现）
  └─ panel
  ↓
ServiceContext（index.ts 提供的现有主进程能力）
```

工具只依赖 `Services` 契约，不操作渲染层 DOM，也不模拟点击。服务不抛异常，统一返回 `{ ok, value } | { ok, error }`；展示文案由工具或面板拼接。Agent 修改状态后照常 `broadcast()`，用户手动操作看到的结果与 Agent 操作一致。契约细节见[服务层与工具契约](agent-service-contracts.md)。

## 会话

- `AgentSession { id, title, mode, model, workspace, ui, history, usage }`。
- 保存在 `userData/mqmz.agent.json`，写入使用临时文件 + 原子重命名，权限 0600。
- 单会话保留 200 条界面消息、200 条模型上下文；界面只传输最近 80 条。
- 首条用户消息生成会话标题；切换会话时取消正在执行的请求。

## 面板布局

- 参考 Codex 与 DSH：左侧按“项目 / 未分组”分组会话；项目来自会话的工作区，未分组保留无工作区会话。
- 右侧只有标题栏和消息区；`计划 / 执行` 与对话模型放在底部输入框内，发送和停止也在同一行。
- macOS 使用系统红绿灯关闭窗口，不再放右上角 X；Windows 保留关闭按钮，避免无边框窗口没有退出入口。
- 工具卡、审批卡和 token 用量保持轻量，不引入 DSH 的完整信息架构。

## 模式与权限

- `plan`：只读工具；请求只带 allow 的只读工具定义，写工具不进入上下文。
- `build`：默认模式；写操作逐次确认。
- 权限按工具静态声明，`allow / ask / deny`。

| 工具 | 作用 | plan | build |
| --- | --- | --- | --- |
| `shelf_list` | 置物架文件列表 | allow | allow |
| `file_read` | 读取置物架文本文件 | allow | allow |
| `file_reveal` | 在访达中定位文件 | allow | allow |
| `file_save_copy` | 另存文件副本 | deny | ask |
| `shelf_remove` | 移出置物架 | deny | ask |
| `convert_start` | 格式转换 | deny | ask |
| `archive_start` | 打包归档 | deny | ask |
| `extract_archive` | 解压压缩包 | deny | ask |
| `rename_files` | 批量重命名 | deny | ask |
| `todo_list` | 待办与清单 | allow | allow |
| `todo_create` | 新建待办 | deny | ask |
| `todo_complete` | 完成待办 | deny | ask |
| `todo_update` | 修改待办 | deny | ask |
| `todo_remove` | 删除待办 | deny | ask |
| `todo_clear_done` | 清理已完成待办 | deny | ask |
| `todo_list_create` | 新建清单 | deny | ask |
| `music_status` | 播放器与歌词 | allow | allow |
| `music_control` | 播放控制 | deny | allow |
| `settings_read` | 读取常用设置 | allow | allow |
| `settings_update` | 修改白名单设置 | deny | ask |
| `clipboard_list` | 剪贴板记录（脱敏） | allow | allow |
| `clipboard_copy` | 复制记录到剪贴板 | deny | ask |
| `clipboard_pin` | 固定/取消固定记录 | deny | ask |
| `mail_list` | 邮箱与最近摘要 | allow | allow |
| `mail_read` | 读取正文与附件名 | allow | allow |
| `mail_send` | 发送邮件 | deny | ask |
| `mail_archive` | 归档邮件 | deny | ask |
| `mail_delete` | 删除邮件 | deny | ask |
| `mail_move` | 移动邮件 | deny | ask |
| `focus_control` | 番茄时钟开始/暂停/重置/跳过 | deny | allow |
| `water_drink` | 记录喝水 | deny | allow |
| `water_snooze` | 延后喝水提醒 | deny | allow |
| `break_snooze` | 延后久坐/护眼提醒 | deny | allow |
| `shell_run` | 执行命令 | deny | ask（每条） |
| `ui_open` | 打开功能面板 | allow | allow |

审批卡展示工具标题与参数；拒绝后把拒绝结果写回模型上下文，避免反复重试同一操作。

## Shell

- 工作区由用户在首次调用时选择（系统目录选择框），保存在当前会话。
- 每条命令都必须确认；确认卡展示完整命令。
- 每次执行都以工作区为 cwd；命令内的 `cd` 不会延续到下一次调用。
- 默认超时 30 秒，可设 1–120 秒；支持取消，取消时终止进程组。
- 输出上限 64 KB，超出截断；返回退出码、标准输出、标准错误与工作目录。

## 宠物人格

当前桌宠只影响称呼、语气和情绪表达：

```text
# 当前桌宠（只影响表达方式）
名字：麻薯
种类：布偶猫
性格：黏人、温和，喜欢待在主人身边
以上只影响称呼、语气和情绪表达；不得改变任务判断、工具选择、
操作安全规则和事实陈述。
```

工作任务始终由官方 Agent 系统提示词与模型能力决定。切换桌宠后，下一次请求会带上新的桌宠信息，不影响已有会话、工具权限或历史任务。数据来源集中在 `activePetProfile()`，接入真正的档案切换时只改这一处。

## 首版未包含

- 生图 Provider 与 `image_generate` 工具。
- 宠物档案新建流程与 Seedream 生成。
- 小程序二维码绑定与档案同步。
- 子 Agent、项目分组、代码编辑工具。

设置 → 宠物档案已提供“新建桌宠”卡片与“绑定小程序”按钮，点击暂时只给出“即将开放”提示。

## 验证

- 真实 DeepSeek（2026-11-13）：`deepseek-flash` 与 `deepseek-v4-pro` 均完成流式文本与 `tool_calls`，`stream_options` 与 `thinking: disabled` 可用。
- 运行时真实联调：`shelf_list` 只读调用、`todo_create` 审批后落库、`shell_run` 审批后执行并返回输出、`plan` 模式未产生写入、会话重启后恢复、token 用量累计。
- 人格切换联调：麻薯 → 小白后，下一次回复使用新名字；同一会话仍正常调用工具。
- Electron 定向用例：`tests/e2e/agent-panel.spec.ts` 覆盖连接页、模型切换、模式切换、新建会话、宠物档案按钮。
- 单元测试：`tests/unit/agent-tools.test.ts`、`agent-runtime.test.ts`、`agent-store.test.ts` 覆盖权限矩阵、参数校验、审批/拒绝/取消、切会话取消、未知工具、持久化、shell 超时与截断。
- 服务契约测试：`tests/unit/services-contract.test.ts` 覆盖结构化成功返回、校验错误、设置白名单、邮件收件人、剪贴板、番茄钟边界和文本/二进制读取。
