# P0-02 技术方案与验收安排

更新日期：2026-11-12（Asia/Shanghai）。

本文件记录方案选择，不表示代码、打包、接口或离线能力已经通过实测。范围基线见 [实施交接](v1-implementation-handoff.md)，系统目标见 [支持矩阵](platform-support-matrix.md)，57 项实施任务见 [验收映射](v1-acceptance-matrix.md)。

## 1. 本轮用户确认的交付规则

- 直接分发 Windows 安装程序与 macOS DMG；首版不以应用商店上架为交付条件。
- **每个安装包包含该平台、该架构所需的全部首版转换引擎及必要资源。** 安装后首次使用转换即可离线运行，不要求用户另外下载引擎、安装全局运行时或预装 Office。
- “全部引擎”以最终输入→输出白名单为范围；候选格式的兼容性仍需样例验证，不能以减少功能或隐藏方向代替报告问题。
- 本地历史、缓存与素材放在系统应用数据目录；截图与转换结果等导出文件由用户选择保存位置。
- 设置提供清理与打开数据目录入口；迁移到自选数据目录不纳入本轮已确认要求。
- 邮箱、歌词在线查询、额度/余额、云端业务、AI 对话与素材生成仍按原有边界联网；本地离线交付规则适用于本地功能和已安装资源。

## 2. 基础依赖选择

构建使用 electron-vite，打包使用 electron-builder；Vue 工作台使用 Pinia 与 Vue Router，运行时边界使用 Zod 校验。数据库使用 SQLite，选 better-sqlite3 适配器并放到数据库任务进程中。

以下是方案选择的**拟采用精确版本**，通过 npm 官方 registry 核实发布元数据与主要 peer 约束；证据见 [元数据快照](research/tech-dependency-metadata.json)。P0 第 3 项已安装其中的窗口原型子集并生成 package-lock.json，完成生产构建与真实 Electron 集成验证；Pinia/Router、数据库、凭据等尚未接入，不能据此认定整套 P1 已通过。

| 用途 | 依赖 | 拟采用版本 |
| --- | --- | --- |
| 桌面运行时 | electron | 45.2.3 |
| Electron 构建 | electron-vite | 5.0.0 |
| 前端构建 | vite | 7.3.7 |
| 安装包 | electron-builder | 26.18.1 |
| UI | vue | 3.5.45 |
| 类型 | typescript | 5.9.3 |
| Vue 类型检查 | vue-tsc | 3.3.14 |
| 状态 | pinia | 3.0.4 |
| 工作台路由 | vue-router | 4.6.4 |
| 输入与协议校验 | zod | 4.6.7 |
| 本地数据库 | better-sqlite3 | 13.0.3 |
| 规则与服务测试 | vitest | 4.1.12 |
| 端到端测试 | @playwright/test | 1.65.0 |

- 开发/构建工具链采用 Node.js 24 LTS 主线；P1 初始化时固定实际补丁版本和包管理器版本，补齐 Vue 编译插件、类型依赖与 lockfile。安装用户无需另外安装 Node.js。
- 选择 electron-vite 5 / Vite 7、TypeScript 5、Pinia 3、Router 4 的组合，保持明确的兼容主线；不把所有包的 latest 标签直接拼成已验证组合。
- SQLite 原生模块需要对 Electron ABI 与三种目标分别构建/核验；若无合适预编译制品，构建机编译后随包交付，不让终端用户现场编译。
- 邮件库、HTML 清洗器、播放器桥接和转换组件在对应真实原型中选择并固定版本；这些尚未完成选型，不预先宣称可发布。
- P1 必须完成类型检查、构建、数据库读写迁移、凭据加解密和开发窗口启动；失败时修正版本选择并记录原因。

## 3. 目录与进程边界

以下为目标结构；当前 main/preload/shared/renderer 与窗口测试已有原型，其余服务、worker、原生桥接和引擎尚未实现：

```text
src/
  main/                 # 生命周期、窗口、权限、IPC、服务调度
    services/           # scheduler / files / mail / media / quota / cloud
    security/           # 凭据、调用来源、文件授权与网络边界
  preload/              # 每个窗口所需的有限业务 API
  renderer/
    pet/                # 宠物窗口
    quick-panel/        # 快捷面板
    workbench/          # 工具、业务、设置
  shared/               # 事件、类型、Zod schema、错误码；无凭据
  workers/              # 数据库、邮件解析等任务进程入口
native/
  macos/                # macOS 媒体等必要原生桥接
  windows/              # Windows 媒体等必要原生桥接
resources/
  pets/                 # 两只预制默认角色
  engines/<platform>-<arch>/
  licenses/             # 依赖、引擎及资源的声明材料
tests/
  unit/
  integration/
  fixtures/             # 可分发的测试样例；不含真实账户内容
```

- 主进程负责窗口、托盘、系统权限、凭据及任务协调；不执行大文件转换或同步数据库查询。
- `services/cloud` 只暴露云端适配器接口与领域类型；官方实现单独成模块，渲染层经受限 IPC 调用，不直接持有令牌或接口细节。分层与开放顺序见 [开源策略](open-source-strategy.md)。
- 三类 UI 各自使用受限 preload；渲染进程关闭 Node 集成，启用上下文隔离和沙箱，只加载项目 UI。邮件 HTML 经清洗并隔离显示，默认不加载远程图片或执行脚本。
- 数据库通过单个独立任务进程串行写入；迁移与事务保持原子性，防止多窗口竞争写入。
- Node 任务采用 `utilityProcess`；外部转换引擎使用参数数组启动独立子进程，`shell: false`，设超时、取消与进程树清理。独立进程不等于安全沙箱，仍限制工作目录、输入路径与输出范围。
- 原生媒体适配按 macOS / Windows 分开实现，只接入经真实验证的能力；Daozai 仅参考思路，不复制业务实现或私有凭据路线。Filee 的 MIT 轮盘几何与拖拽交互按用户要求移植，保留版权声明并改为 mqmz 命名。

## 4. IPC、任务与命名

- 通道形如 `mqmz:conversion:create`、`mqmz:mail:code-detected`；不暴露通用 `send`、任意 shell、任意 SQL 或任意文件读写入口。
- preload 按窗口暴露最小业务方法；主进程同时校验发送窗口、主 frame/来源、schema、权限与任务归属，不能只依赖 TypeScript 类型。
- 文件由本地选择器或拖放登记授权，渲染层之后使用文件引用 ID；拒绝越界路径、符号链接逃逸、伪造文件 ID 与非白名单外部 URL。
- 任务模型至少包含任务 ID、模块、状态、进度、创建/更新时间、错误码、取消能力与资源引用；状态采用 queued/running/succeeded/failed/cancelled。
- 跨进程事件带任务 ID、序号与作用域；渲染层重连后查询快照，丢弃旧序号，避免重复通知或上一任务覆盖当前状态。
- 提醒基于本地规则与时间戳调度，结合休眠/唤醒重新计算；宠物只消费行为事件，不触发背景模型调用。
- 配置键 `mqmz.settings.*`，环境变量 `MQMZ_*`，本地表 `mqmz_*`；业务类型/函数遵循 TypeScript 常规命名。云端既有表遵守原仓库规范。

## 5. 本地数据与凭据

- 稳定应用 ID 拟定为 `com.mqmz.desktop`，凭据用途标识沿用 `com.mqmz.desktop.mail` 等；发布签名与 ID 固定后保持一致。
- 在首个窗口/会话创建前显式设置本应用 `userData`：Windows 使用系统 LocalAppData 下的 `mqmz-desktop`，预期为 `%LOCALAPPDATA%/mqmz-desktop`；macOS 使用 `app.getPath('appData')` 下的 `mqmz-desktop`，预期为 `~/Library/Application Support/mqmz-desktop`。实际路径以系统解析为准，见 [Electron app 文档](https://www.electronjs.org/docs/latest/api/app)与 [Windows Known Folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)。Windows 采用本地目录，避免将设备历史默认放入漫游配置目录；应用不发起自动同步或云备份。
- 子目录划分为 `db/`、`credentials/`、`cache/`、`assets/`、`jobs/`、`logs/` 与 Chromium 会话目录；数据库拟名 `mqmz.sqlite3`，表如 `mqmz_settings`、`mqmz_todos`、`mqmz_reminder_records`、`mqmz_clipboard_items`、`mqmz_conversion_jobs`。
- P0 最小置物架已用 `mqmz.file-shelf.json` 持久化本地文件索引，原件保留原处；P3 接入 SQLite 时迁移并保留这些记录。文件卡片独立为旁侧轻窗口；大型开发诊断台不进入正式版。
- “吃掉”把文件移入 `mqmz-desktop/belly/`，索引写入 `mqmz.belly.json`，默认保留 7 天并可在置物架取回；到期清理只删除回收区内的副本。该目录属于本地数据，不参与云端同步。
- 文件拖入桌宠时使用 Filee 式等分圆环（MIT 移植）：十个 36° 扇区为置物架、格式转换、打包归档、解压缩、压缩大小、吃掉、另存副本、提取音频、批量重命名、智能问答，中心是宠物、松手取消；扇区间距 3px 等宽、圆角 6px、悬停弹出 7px；外缘用径向渐变光晕（外径 +22，峰值 20%）。圆环只在拖拽期间存在，不额外占用常驻窗口；展开时先把透明窗口从 132×156 瞬间切到 312×312 DIP、再挂载轮盘（窗口不参与动画，避免裁剪），关闭时先播完轮盘收起再恢复窗口。
- 原始文件保持在原处；置物架保存索引。截图、附件、缓存、素材与引擎采用各自明确的所有权/清理策略。
- 清理先展示类别与大小；固定项、凭据、历史、下载素材与临时文件分开处理，保护运行中的任务，不因移除索引删除用户源文件。SQLite 清理通过事务执行，不在运行中直接删除数据库文件。
- 使用 Electron `safeStorage` 异步接口保护邮箱、DeepSeek 等凭据，密文写本机，UI 只展示脱敏状态；密钥不可用时停止相关认证，不回退明文存储。其 macOS Keychain、Windows DPAPI 语义和签名要求见 [safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage)。本方案不承诺防止同一已登录用户下的所有恶意进程读取数据。
- 系统凭据加密不代表 SQLite 与所有文件均已加密；历史保留、敏感剪贴板排除和清理仍需单独实现。
- 云端账户缓存按业务账户隔离；切换/退出清理旧会话与旧额度状态。设备级离线工具记录不因云端退出被误删。
- 日志不记录凭据、邮件正文、验证码、剪贴板/截图正文或本地文件内容；不开启自动上传日志、故障转储、遥测或自动云备份。

## 6. 联网与业务范围

| 路线 | 请求目标与允许内容 |
| --- | --- |
| 本地工具、转换与默认动画 | 本机；原文件、剪贴板、截图、历史与行为不自动上传 |
| 邮箱 | 本机直连用户邮箱提供方，正文/附件缓存本地 |
| 播放器与歌词 | 本地控制；在线查词开关开启后向提供方发送必要歌曲信息 |
| 额度与余额 | 本机直连相应提供方，凭据不经自家服务；每个客户端分别验证 |
| 毛趣映画业务 | 登录/设备会话、宠物档案、交友状态、新 DeepSeek 会话等白名单业务 |
| BYOK 聊天与制作 | 按原基线执行用户主动对话、Key 安全托管、选定档案图生成与积分结算 |

开发验收检查实际请求目标与请求体；不能仅凭 UI 声明判断本地数据未上传。网络故障不影响本地提醒、历史、已安装引擎和动画播放。

### 6.1 客户端信任模型与开放分层

- 只维护一条公开开源的客户端代码线，不按安装包区分开源与闭源，按能力分层：本地功能不要求登录；宠物档案与云同步需绑定账户；交友广场仅对已绑定账户开放并移出首个公开开源版本，由服务端运营开关控制，见 [开源策略](open-source-strategy.md)。
- 客户端不保存 AppSecret、私钥、管理接口凭据或数据库凭据；接口地址按公开信息处理。身份、设备、资源归属、限流与审核全部由服务端执行，客户端开关或请求头不构成权限。
- 桌面端只访问白名单业务网关（如 `/api/desktop/v1/*`）；管理、审核与内部接口不向桌面端暴露。
- 服务端按账号、设备与 IP 限流，并对新设备注册和异常频率做风控；退出、令牌失效或设备撤销后，客户端清理旧会话与相关缓存。
- 首个公开开源版本不注册交友路由与入口；后续开放只增加适配器实现与服务端开关，不改本地层代码。

## 7. 全量引擎交付

Windows x64、macOS x64、macOS arm64 各自构建独立安装包，使用 electron-builder 的普通 NSIS 与 DMG 目标，不采用需要联网取主载荷的 Web installer。引擎及其动态库、资源、必要运行时放到 `extraResources`，避免放进只读 ASAR 后无法直接执行；打包设置依据见 [electron-builder 配置](https://www.electron.build/v26/docs/configuration/)。

每个引擎制品必须有清单：ID、版本、来源、适用系统/架构、支持的转换方向、SHA-256、入口、附带运行时/资源、许可/源码材料、签名状态、压缩与安装后体积。校验失败、错架构或组件缺失时显示具体错误，不在后台偷偷下载修复。

以下只核实候选的许可起点，**尚未取得和验证三平台制品，也未固定最终引擎组合**：

| 候选 | 用途 | 已核实依据与待办 |
| --- | --- | --- |
| FFmpeg / ffprobe | 影音转换、探测、提取音频 | [官方许可说明](https://ffmpeg.org/legal.html)区分 LGPL 与启用 GPL/nonfree 组件的构建；需记录实际编译配置、编解码器、对应源码与声明，不把任意下载的二进制视为可分发 |
| LibreOffice | Office 转 PDF、旧格式转换候选 | [官方许可](https://www.libreoffice.org/licenses/)以 MPL 2.0 为基础并含其他许可组件；需检查具体制品 LICENSE、字体和附带组件，验证中文排版、无界面启动与最低系统 |
| qpdf | PDF 合并、拆分等结构操作候选 | [官方许可](https://qpdf.readthedocs.io/en/stable/license.html)为 Apache 2.0；具体二进制及依赖仍需核验；它不覆盖所有 PDF 渲染、OCR 或文本提取能力 |
| 7-Zip | 7Z/ZIP 打包及常见压缩包解压候选 | [官方许可](https://www.7-zip.org/license.txt)包含 LGPL、BSD 与部分 unRAR 限制；需按实际组件保留声明并核对三类制品 |
| 图片/HEIC、PDF 渲染/文字、OFD、表格/文本 | 覆盖其余白名单方向 | 图片 JPG/PNG/WEBP 已用 sharp 接入，PDF 生成/合并/拆分用 pdf-lib；HEIC、PDF 渲染成图片、OFD、OCR 与复杂文档仍待选型与验证 |

P5 的引擎安装任务改为全量内置与完整性管理。卸载本地历史不能删除安装目录内引擎而破坏全量离线能力；引擎更新通过校验后的应用更新交付，禁止生成内容或本地历史随更新上传。

## 8. 验收与当前缺口

- 57 项原清单均有稳定 ID、负责模块、验收方法与当前缺口，见 [验收映射](v1-acceptance-matrix.md)。聊天中第 2 项对应原清单 H-P0-03、H-P0-04；编号不与七项讨论顺序混用。
- 本轮完成文档方案、公开元数据核实、映射覆盖与一致性检查；不把它们计为 P1 构建或任何真实服务通过。
- 全量离线验收：干净系统断网安装；不预装 Office/引擎/运行时；首次转换执行全部白名单方向，验证无下载、无外传、原件保留、失败可解释；三架构和最低系统分别留证。
- 安装包体积与空闲/转换资源预算待实际引擎组成和原型测量后确定，不能当前估算为已达标。
- 仍缺 Windows 10、macOS 13、Intel Mac 的运行证据；Windows 11 细节待补；签名/公证材料、更新托管、各服务授权、引擎最终组合与许可清单待相应阶段落实。
- 第 3 项已实现透明窗口与交互原型，实测范围和剩余项见 [窗口原型记录](p0-window-prototype.md)；播放器、邮箱、额度与动画按用户要求逐项推进。

## 9. 主要官方参考

- [electron-vite 构建边界](https://electron-vite.org/guide/)
- [Electron 进程任务 API](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder NSIS](https://www.electron.build/v26/docs/nsis/) 与 [DMG](https://www.electron.build/v26/docs/dmg/)

以上是项目自行设计的工程边界。Filee 的 MIT 许可轮盘几何与交互代码已移植并在 [THIRD-PARTY-NOTICES](../THIRD-PARTY-NOTICES.md) 署名；其品牌素材与其余业务实现未引入，Daozai 仅参考思路。
