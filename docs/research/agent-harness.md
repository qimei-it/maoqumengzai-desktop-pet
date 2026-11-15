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

## 窗口行为

- 智能体窗口是普通应用窗口：原生拖拽边缘调整大小，最小 720×520，默认 920×640。
- macOS 使用系统红绿灯；绿色按钮执行 zoom/铺满工作区，不进入全屏。Windows 使用自定义最小化、最大化/还原、关闭按钮。
- 双击标题栏或侧栏顶部空白区域在放大/还原之间切换；如果系统原生标题栏已经处理，渲染层不会重复切换。
- 最大化后去掉外层透明边距、圆角和阴影，铺满工作区；macOS 前台调度留出的空间交给系统处理。
- 窗口位置、尺寸和最大化状态保存在 `userData/mqmz.agent-window.json`，重启后恢复；没有记录时使用默认尺寸居中。
- 桌宠移动、缩放不再重新定位智能体窗口；显示器变化时只做可见区域夹取，不重新居中。
- Windows 实机验证尚未执行。

## 面板布局

- 参考 Codex 与 DSH：左侧按“项目 / 未分组”分组会话；项目来自会话的工作区，未分组保留无工作区会话。
- 右侧只有标题栏和消息区；底部输入框左侧依次是附件 `+`、对话工作区选择、`计划 / 执行`，右侧是模型与推理强度、发送。
- 输入框占位为「让“{桌宠名}”来帮你工作」，不区分项目；空对话提示按当前会话是否属于项目切换，项目名使用 `.` 字符组成的虚线下划线。
- 助手输出下方提供「保存」与「导出音频」：保存 Markdown 源格式到「设置 → 智能体 → 附件保存目录」（默认 `Downloads/maoqumengzai/agent`），音频使用系统本地语音引擎导出 WAV，不调用 DeepSeek TTS。
- 助手 Markdown 输出支持 Mermaid 11.17.2 懒加载渲染，只渲染完整代码块，失败回退源码。
- 输入框左下角的 `+` 打开系统文件选择框；附件在输入框顶部以药丸显示，文件类型图标复用置物架素材。最多 8 个，文本单文件 12k 字符、整轮 30k 字符；纯文本上限 2 MB，文档/图片/压缩包 20 MB，音视频 200 MB。附件正文随该条消息发送，消息里只保留文件名。
- 拖动文件到智能体面板可直接加入当前对话，拖入时显示“添加到当前对话”覆盖提示；拖动文件到桌宠并选择“智能体”会按文件路径直接新建未分组对话并挂载附件，不经过置物架。
- 附件草稿由主进程持有并同步到面板；切换会话、新建对话、删除当前会话或发送成功时清理，发送失败时保留以便重试。
- 附件解析期间在标题栏下方显示「解析附件 n/总数 · 文件名 · 阶段」和「取消」，解析中禁用发送与继续添加；单文件超时 120 秒，取消后保留已完成附件并清理临时文件。
- 附件优先本地解析：文本与代码直接读取；PDF 用 PDF.js 抽取文字；Office 走本地 LibreOffice；OFD 用 EasyOFD 渲染；EPUB 读取书脊文本；压缩包解压后只汇总可读文字；BMP/TIFF/HEIC 用 sharp 转 PNG。扫描版 PDF、图片、无本地 Office 的文档和 MOBI 才通过 DeepSeek Files API 上传，音频与视频用 FFmpeg 切成 16 kHz WAV 后调用 ASR 转写。
- `deepseek-v4-pro` 只接受文字：需要上传解析的图片/文档在添加时直接拦截，切到 Pro 时也会移除已选附件并提示；音频转写结果按文字发送，不受影响。被拒绝或不支持的附件不会出现在输入框下方，只显示 toast。
- Files API 上传按 30 天有效期保存 `file_id`；后续轮次到期前会自动重传，本地源文件不在时在历史里标注附件已过期。删除会话时同步删除已上传文件。
- 对话工作区按钮显示当前项目名，点击后弹出项目选择面板：搜索项目、当前项目勾选、新建项目、不在项目中工作。选择项目会把会话的 `workspace` 设为项目目录并归入该项目；新建项目成功后自动选中；不在项目中工作时清空工作区与项目归属。
- 模型使用完整名称：`deepseek-flash` 为 DeepSeek-V4.1-Flash，`deepseek-v4-pro` 为 DeepSeek-V4-Pro。两者都支持思考/非思考、JSON Output、Tool Calls、Responses/Anthropic API 和前缀续写，上下文 1M、最大输出 384K；图像理解仅 Flash 支持，Pro 不支持。
- 推理强度可选关闭 / 低 / 高 / 最高，默认高。关闭时发送 `thinking.type = disabled`；开启时发送 `thinking.type = enabled` 和 `reasoning_effort`。思考模式带 `tools` 的请求必须在历史中回传 `reasoning_content`，否则接口返回 400。
- `计划 / 执行` 使用滑块轨道切换，滑块位置随当前模式过渡。
- macOS 使用系统红绿灯关闭窗口，不再放右上角 X；Windows 保留关闭按钮，避免无边框窗口没有退出入口。
- 工具卡、审批卡和 token 用量保持轻量，不引入 DSH 的完整信息架构。

## 项目与会话

- 侧边栏分为「新建对话」「项目」「未分组」三块；「新建对话」固定在侧栏顶部、不随会话列表滚动，项目和未分组都支持整体展开/收起。
- 侧边栏不提供工作区选择入口；未分组的会话在首次执行 `shell_run` 时通过系统目录选择框确定工作区。
- 项目保存名称、工作目录、置顶状态和创建时间；会话通过 `projectId` 归属项目，工作目录跟随项目。
- 项目菜单：置顶、编辑、在 Finder/资源管理器中打开、删除。删除项目只移除项目，会话移动到未分组，不删除对话记录。
- 会话菜单：重命名、置顶、移动、删除。置顶项目与会话排在同组最前。
- 项目行悬停显示菜单和“在此项目新建对话”；会话行悬停显示菜单。项目展开后无对话时显示“暂无对话”。
- 创建/编辑项目使用轻量对话框：名称、源文件夹、取消/保存；编辑时提供“移除本地项目”。
- 存储升级到版本 2；版本 1 的会话按工作目录自动迁移为项目。

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
- 附件定向用例：`tests/e2e/agent-attachments.spec.ts` 用本地 mock 验证文本附件、图片 Files API 上传、聊天中的 `file` 内容块，以及切换 Pro 后移除上传类附件；并覆盖拖入智能体面板时的提示、附件药丸、解析进度与取消。
- 解析超时用例：`tests/e2e/agent-attachment-timeout.spec.ts` 通过 `MQMZ_AGENT_PARSE_TIMEOUT_MS=300` 和本地 LibreOffice DOCX 验证超时后不产生附件草稿。
- 桌宠投递用例：`tests/e2e/prototype.spec.ts` 的“dropping on 智能体”验证直接路径投递、不进入置物架、新建未分组对话并挂载附件。
- 附件真实联调（2026-11-15）：使用有效 DeepSeek Key，向 `deepseek-flash` 发送 1 张 PNG 与 1 段 16 kHz PCM WAV。Files API 返回 `file-api-...` 且写入 30 天过期时间；ASR 返回并注入“你好，这是语音测试。”；模型回答“红色”并复述语音内容；删除会话后本地文件引用清空。
- 附件单元测试：`tests/unit/agent-attachment-pipeline.test.ts` 覆盖文本、PDF、扫描件、DOCX（本地 LibreOffice）、EPUB、图片、压缩包、PCM WAV、AIFF→16 kHz WAV（本地 FFmpeg）与不支持格式；`tests/unit/agent-files.test.ts` 覆盖 multipart 字段顺序、错误映射和 ASR 限制；`tests/unit/agent-runtime.test.ts` 覆盖上传历史、ASR 文本、Pro 拦截、上传失败降级和 30 天过期重传。
- 单元测试：`tests/unit/agent-tools.test.ts`、`agent-runtime.test.ts`、`agent-store.test.ts` 覆盖权限矩阵、参数校验、审批/拒绝/取消、切会话取消、未知工具、持久化、项目迁移、shell 超时与截断。
- 服务契约测试：`tests/unit/services-contract.test.ts` 覆盖结构化成功返回、校验错误、设置白名单、邮件收件人、剪贴板、番茄钟边界和文本/二进制读取。
