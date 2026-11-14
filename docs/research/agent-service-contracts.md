# 服务层与工具契约

更新日期：2026-11-14。

## 目标

用户修改已有功能时，只要不改变服务契约，智能体工具就不需要跟着改；服务内部实现、UI 布局和文案变化都被挡在契约后面。

```text
Vue 面板 ── commandSchema ──┐
                            ├─ 同一个服务实现
智能体 ── tools.ts ── Services ┘
                            │
                            ▼
                 ServiceContext（主进程现有能力）
```

- `src/main/services/contracts.ts`：给工具和 UI 的稳定契约，只包含类型。
- `src/main/services/create.ts`：服务实现，负责校验、结构化返回和错误收敛。
- `src/main/services/context.ts`：服务向主进程请求的底层能力，只有 `index.ts` 实现。
- `src/main/services/shell.ts`：shell 执行的独立实现。
- `src/main/agent/tools.ts`：只依赖 `Services`，不接触窗口、DOM 或 `index.ts` 变量。

## 统一返回

所有服务方法返回：

```ts
type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }
```

- 服务不抛异常；参数、业务和外部错误都收敛成 `ok: false`。
- 服务只返回结构化数据，不返回“已转换 2 个文件”这类展示文案。
- 文案由 `tools.ts` 或面板根据结构自己拼。

## 服务清单

| 服务 | 方法 | 返回结构 |
| --- | --- | --- |
| `shelf` | `list` / `read` / `reveal` / `saveCopy` / `remove` | 文件列表、文本、保存路径 |
| `convert` | `run(fileIds, action, password?)` | `converted`、`failed`、`outputs`、`messages` |
| `archive` | `create(fileIds, format)` / `extract(fileIds)` | 包名/大小/数量、解压数量 |
| `rename` | `run(fileIds, config)` | 重命名数量 |
| `todo` | `list` / `create` / `complete` / `update` / `remove` / `clearDone` / `createList` | 待办快照、单条结果、数量 |
| `mail` | `list` / `read` / `send` / `archive` / `remove` / `move` | 摘要、正文、发送结果、邮件主题 |
| `music` | `status` / `control` | 播放状态、控制结果 |
| `settings` | `read` / `update` | 白名单设置快照 |
| `clipboard` | `list` / `copy` / `pin` | 记录列表、操作结果 |
| `focus` | `control` / `drink` / `snoozeWater` / `snoozeBreak` | 阶段/运行状态、喝水进度、延后分钟 |
| `panel` | `open(target)` | 操作结果 |

`services/shell.ts` 不依赖 `ServiceContext`，输入命令、工作区、超时和取消信号，返回退出码、标准输出/错误、截断、超时和取消标记。

## 变更时怎么判断

| 改动 | 智能体是否需要改 |
| --- | --- |
| 只改 Vue 布局、样式、动画、面板文案 | 不需要 |
| 改服务内部算法、引擎、进度条、缓存 | 不需要 |
| 改 `context.ts` 里的底层实现，不动服务签名 | 不需要 |
| 改服务方法签名或返回结构 | 需要改；`typecheck` 会直接报错 |
| 改工具参数、语义、权限 | 需要改工具 schema、权限表、契约测试和本文档 |
| 新增功能 | 新增服务方法 + 新工具，否则智能体看不到 |
| 只改错误文案 | 代码不用改；但错误会进入模型上下文，需要确认语义没变 |

## 契约测试

- `tests/unit/services-contract.test.ts`：真实服务实现 + 假 context，覆盖成功返回、校验错误、设置白名单、邮件收件人、剪贴板、番茄钟边界和文本/二进制读取。
- `tests/unit/agent-tools.test.ts`：工具层权限矩阵、参数校验、服务调用和 shell 超时/截断。
- `tests/unit/agent-runtime.test.ts`：审批、拒绝、取消、切会话取消、未知工具和持久化。
- `tests/unit/agent-store.test.ts`：会话存储读写、上限和损坏过滤。

新增或修改工具时，至少同步更新：

1. `services/contracts.ts` 或工具 schema。
2. 对应契约测试。
3. `docs/research/agent-harness.md` 的工具权限表。
4. 本文档的服务清单（新增服务时）。

## 迁移状态

- 智能体工具已完全依赖 `Services`，不再依赖 `AgentDeps`。
- UI 命令目前仍直接调用主进程函数；这些函数与服务共用同一实现。后续可以按域把命令分支迁到服务调用，迁移时不需要改工具。
