# P0-01 双平台支持矩阵

更新日期：2026-11-12（Asia/Shanghai）。

状态：支持目标已收敛为 Windows x64 与 macOS Apple Silicon 两类。macOS Intel 不再纳入支持范围。第 3 项已有 macOS arm64 原型的部分实测证据，不代表完整应用通过。

## 已确认支持目标

| 平台 | 发行架构 | 最低系统 | 设备/系统证据 | 应用实测 |
| --- | --- | --- | --- | --- |
| Windows | x64 | Windows 10 22H2；同时覆盖 Windows 11 | 用户提供 Windows 11 测试环境，具体版本、构建号与设备架构待核实；Windows 10 22H2 环境尚未确认 | 待验证 |
| macOS / Apple Silicon | arm64 | macOS 13 Ventura | macOS 27.0.1（26A434），arm64；已运行 P0 Electron 原型与当前功能 | 部分通过；最低系统待验证 |

- Windows x64 与 macOS arm64 是当前仅有的发行目标，缺少设备的格子保持待验证。
- macOS Intel（x64）已明确取消，不构建、不分发、不验收。
- Windows ARM 不在当前架构清单内；不据此追加支持承诺。
- 已取得当前 macOS arm64 环境信息，不代表 macOS 13 或 Windows 的兼容验收通过。
- 最低版本是已确认的产品支持目标，仍须与播放器版本、原生桥接、截图、凭据存储和转换引擎核对。若发现冲突，报告证据与处理选项，不静默删减功能或提高最低版本。

## 按系统版本保留的实测格子

| 系统 | 架构 | 环境状态 | 应用验收 |
| --- | --- | --- | --- |
| Windows 10 22H2 | x64 | 测试设备尚未确认 | 待验证 |
| Windows 11 | x64 目标 | 用户已提供系统版本；具体发行版本、构建号、设备架构待核实 | 待验证；1.0.0/1.0.1 安装包缺少 `sharp` 原生模块、启动即崩溃，从 1.0.2 起改在 Windows 构建 |
| macOS 13 | Apple Silicon / arm64 | 最低版本测试环境尚未确认 | 待验证 |
| macOS 27.0.1（26A434） | Apple Silicon / arm64 | 已运行原型并实测两块不同缩放屏幕的窗口归属及实际屏幕预览 | 部分通过；完整清单见 [验证记录](archive/p0-window-prototype.md) |

## 官方依据与判断

核实日期：2026-11-09。

1. [Electron 44 发布说明](https://www.electronjs.org/blog/electron-44-0)明确 Electron 44 及以上需要 macOS 13 或更高版本。用户已选择以 macOS 13 作为最低支持目标；这不等于已验证整个应用在该版本运行。
2. [Electron 安装文档](https://www.electronjs.org/docs/latest/tutorial/installation)列出 x64（64 位 Windows）与 arm64（Apple Silicon）的预编译架构。当前只保留 Windows x64 与 macOS arm64 两个构建目标。
3. [Microsoft Windows 10 Home / Pro 生命周期](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro)记录常规支持于 2025-10-14 结束，LTSC 有各自生命周期。已向用户说明并优先建议 Windows 11；用户明确选择增加 Windows 10 22H2 x64 支持，后续按此目标验证，不能将操作系统生命周期直接等同于应用无法运行。
4. [技术方案](technical-architecture.md)已选择 Electron 45.2.3 作为拟采用版本，并保存 npm 发布元数据；安装、组合构建和实际制品仍待验证，发布时再次核对[官方支持计划](https://releases.electronjs.org/schedule)。

## 测试记录规则

为两个发行架构分别保留记录；同一架构的最低系统与较新系统使用独立行，不合并成一次“全部通过”。

| 记录字段 | 内容 |
| --- | --- |
| 环境 | 系统完整版本与构建号、CPU 架构、实体机/虚拟机 |
| 显示 | 屏幕数量、分辨率、缩放比例；缺少多屏条件时注明 |
| 应用 | 应用版本或提交、Electron 版本、运行制品架构 |
| 方法 | 实际操作、期望结果、实际结果、证据与复测记录 |
| 状态 | 待设备、待版本信息、未测试、通过、失败；失败附具体限制 |

交叉构建成功不能替代目标平台运行。虚拟机的运行证据须注明，涉及窗口、图形、缩放与系统权限的行为需要相应真实环境核对。

## 本项完成条件

- [x] 记录当前支持的两类平台与架构：Windows x64、macOS arm64。
- [x] 核实 Electron 官方支持依据并提出最低版本建议。
- [x] 用户确定最低 Windows / macOS 版本：Windows 10 22H2 x64，macOS 13+ Apple Silicon。
- [x] 记录测试设备可用情况、实际系统版本或明确的缺口：Windows 11、macOS 27；其他系统及具体配置缺口见上表。

完成本项意味着支持目标与验证安排已确定；实际窗口、媒体、邮箱、额度与动画能力按后续各项分别验收。缺少设备可明确记录为待验证，不伪造兼容结论。
