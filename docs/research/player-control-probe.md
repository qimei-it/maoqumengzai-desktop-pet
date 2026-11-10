# 播放器控制与歌词能力摸底（macOS 本机）

日期：2026-11-09（Asia/Shanghai）。本轮只做只读检查，未播放音频、未修改任何播放器设置。

## 结论先行

macOS 上四款播放器的能力并不对等：

| 播放器 | 播放控制 | 歌曲信息/进度 | 歌词 | 结论 |
| --- | --- | --- | --- | --- |
| Apple Music | AppleScript：`playpause`、`play`、`pause`、`next track`、`previous track` | `player state`、`player position`（可读可写）、`current track` 的 `name`/`artist`/`duration` | 曲目对象自带 `lyrics` 属性 | 可完整实现，优先支持 |
| 网易云音乐 3.1.9 | 系统 MediaRemote：播放/暂停、上一首/下一首均可用 | 歌名、歌手、专辑、时长可读；进度只有快照，不连续 | 无系统接口 | 可控制与显示歌曲信息，进度不可靠 |
| QQ 音乐 11.11.0 | 系统 MediaRemote：播放/暂停、上一首/下一首均可用 | 歌名、歌手、专辑、时长可读；**进度恒为 0** | 无系统接口 | 可控制与显示歌曲信息，进度需另寻路径 |
| 酷狗 20.3.8 | 系统 MediaRemote：播放/暂停、上一首/下一首均可用 | 歌名、歌手、专辑、时长可读；**进度恒为 0** | 无系统接口 | 与 QQ 音乐能力一致 |

## 2026-11-10 QQ 音乐实测记录

- 环境：macOS 27.0.1（arm64）、QQ 音乐 11.11.0、酷狗 20.3.8、`nowplaying-cli` 2.1.0（开发期探针，走系统 MediaRemote）。
- 播放中读取：`title=好想我回来啊 (Live)`、`artist=华晨宇`、`album=声音避风港`、`duration=289`、`playbackRate=1`；`ClientBundleIdentifier=com.tencent.QQMusicMac`。
- 控制：`togglePlayPause` 生效（`playbackRate` 1 → 空 → 1）；`next` / `previous` 生效，切歌后标题与时长随之更新（响应有 2–4 秒延迟）。
- 进度：`elapsedTime` 连续查询始终为 0，QQ 音乐没有把播放位置交给系统。
- 探针命令：`nowplaying-cli get title artist album duration elapsedTime playbackRate`、`nowplaying-cli togglePlayPause|next|previous`。
- 限制：`nowplaying-cli` 直接调用私有 `MediaRemote`；正式版是否内置自研 Swift helper、还是退回媒体键 + 辅助功能授权，待其余播放器验证后统一决定。

### 2026-11-10 酷狗实测记录

- 播放中读取：`title=雨爱`、`artist=杨丞琳`、`album=雨爱`、`duration=260.48`、`playbackRate=1`；`ClientBundleIdentifier=com.kugou.mac.Music`。
- 控制：`togglePlayPause` 生效（1 → 0 → 1）；`next` / `previous` 生效，切歌后标题与歌手更新（响应约 2–4 秒）。
- 进度：`elapsedTime` 首次读到 0.14，之后连续查询为 0，不提供可用播放位置。
- 结论：酷狗与 QQ 音乐能力一致——可控制、可读歌曲信息、无进度。

### 2026-11-10 网易云实测记录

- 播放中读取：`title=好想爱这个世界啊`、`artist=华晨宇`、`album=新世界NEW WORLD`、`duration=258.88`、`playbackRate=1`；`ClientBundleIdentifier=com.netease.163music`。
- 控制：`togglePlayPause` 生效（1 → 0 → 1）；`next` / `previous` 生效，切歌后信息更新。
- 进度：原始字典曾出现 `ElapsedTime=143`，但随后连续查询固定为 0.085，不随时间推进；没有 `Timestamp` 字段可以外推。判断为“只在状态变化时发布快照”，不能用于实时进度条。
- 结论：网易云可控制、可读歌曲信息，进度不可靠；与产品约定“无可靠进度时展示文本”一致。

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

## 正式方案与探针脚本

macOS 不依赖第三方 CLI，改为自带的 MediaRemote helper（已编译为通用二进制 `resources/helpers/mqmz-nowplaying`，随应用打包；主进程每 2.5 秒轮询一次）。Apple Music 在 macOS 27 上不向旧的 MediaRemote 接口暴露信息，单独走 AppleScript：

- `scripts/probe-media-macos.swift`
  - `info`：输出 title/artist/album/duration/elapsed/rate 的 JSON
  - `play` / `pause` / `toggle` / `next` / `previous`
  - 命令走 XPC，发送后需等待约 400ms 再退出，否则命令可能丢失
  - 2026-11-10 用网易云实测：信息读取、播放/暂停、上一首/下一首全部生效
  - QQ 音乐、酷狗走同一套接口；进度仍按各家是否上报为准

Windows 用公开的 SMTC 探针，待实机验证：

- `scripts/probe-smtc.ps1`
  - `info`：title/artist/album/duration/elapsed/status/client（`SourceAppUserModelId`）
  - `play` / `pause` / `toggle` / `next` / `previous`
  - 依赖 `Windows.Media.Control`，读取 `GetTimelineProperties()` 的位置与 `LastUpdatedTime` 外推

Apple Music 继续用 AppleScript，只有它能提供可靠的实时进度。

## 待验证

- Apple Music 的真实播放/暂停/切歌与进度读取（需要可播放内容与会话）。
- 网易云、QQ、酷狗在 macOS 的媒体键响应与辅助功能授权。
- Windows 四款播放器的 SMTC 支持矩阵。
- 歌词来源（LRCLIB / AMLL）与本地 LRC 的匹配效果；Apple Music 可优先用其自带歌词。
