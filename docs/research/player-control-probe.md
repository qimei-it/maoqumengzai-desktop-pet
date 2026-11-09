# 播放器控制与歌词能力摸底（macOS 本机）

日期：2026-11-09（Asia/Shanghai）。本轮只做只读检查，未播放音频、未修改任何播放器设置。

## 结论先行

macOS 上四款播放器的能力并不对等：

| 播放器 | 播放控制 | 歌曲信息/进度 | 歌词 | 结论 |
| --- | --- | --- | --- | --- |
| Apple Music | AppleScript：`playpause`、`play`、`pause`、`next track`、`previous track` | `player state`、`player position`（可读可写）、`current track` 的 `name`/`artist`/`duration` | 曲目对象自带 `lyrics` 属性 | 可完整实现，优先支持 |
| 网易云音乐 3.1.9 | 未提供 AppleScript 字典 | 无法通过公开接口读取 | 不能从系统接口取得 | 只能考虑媒体键，且信息/歌词缺失 |
| QQ 音乐 / 酷狗 | 未安装，待验证 | 待验证 | 待验证 | 装机后再测 |

## 依据

- Apple Music：`sdef /System/Applications/Music.app` 中存在 `playpause`、`play`、`pause`、`next track`、`previous track` 命令，以及 `player state`、`player position`、`current track`、`name`、`artist`、`duration`、`lyrics` 属性。
- 网易云音乐：`sdef /Applications/NeteaseMusic.app` 返回 `error -192`；`Info.plist` 没有 `OSAScriptingDefinition` 或 `NSAppleScriptEnabled`，说明它不提供 AppleScript 控制。
- 系统存在 `/System/Library/PrivateFrameworks/MediaRemote.framework`，但属于私有框架，且新系统对调用方有限制；不纳入正式方案。
- 本机 `AXIsProcessTrusted()` 为 `false`。若采用媒体键模拟控制第三方播放器，需要用户在系统设置中授予“辅助功能”权限；这应作为明确的安装引导，而不是静默失败。

## 对首版的含义

1. **macOS 上不要承诺四款播放器都能显示歌词。** Apple Music 可以；其余三款在公开接口下拿不到歌名/歌手，也就无法可靠匹配歌词。
2. **媒体键是 macOS 控制第三方播放器的唯一通用路径。** 它能覆盖上一首/下一首/播放暂停，但需要辅助功能授权，并且无法区分当前是哪个播放器。
3. **Windows 的预期更好。** `GlobalSystemMediaTransportControlsSession` 可提供歌名、歌手、时长、播放位置和控制命令，但需要逐款实测（QQ 音乐、网易云、酷狗是否接入 SMTC）。
4. **产品文案要如实。** 无法读取信息时显示“已连接控制，系统未提供歌曲信息”，不能显示空白或假歌词。

## 待验证

- Apple Music 的真实播放/暂停/切歌与进度读取（需要可播放内容与会话）。
- 网易云、QQ、酷狗在 macOS 的媒体键响应与辅助功能授权。
- Windows 四款播放器的 SMTC 支持矩阵。
- 歌词来源（LRCLIB / AMLL）与本地 LRC 的匹配效果；Apple Music 可优先用其自带歌词。
