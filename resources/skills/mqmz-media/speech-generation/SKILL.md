---
name: 语音生成
description: 当用户要求把文字转成语音、配音、朗读音频或指定音色生成音频时，调用 speech_generate 工具。
---

# 语音生成

用户要求生成音频时，调用 `speech_generate`。

## 参数

- `text`：必填，最终要朗读的文本
- `voice_id`：音色 ID，默认 `male-qn-qingse`
- `speed`：0.5–2，默认 1
- `emotion`：`happy` / `sad` / `angry` / `fearful` / `disgusted` / `surprised` / `calm`，默认自动
- `format`：`mp3` / `wav`，默认 `mp3`
- `quality`：`hd` / `turbo`，默认 `hd`

## 规则

- 输入是最终台词，不要额外加入旁白说明。
- 用户只给描述而没有台词时，先改写成自然、可直接朗读的台词，再调用工具。
- 生成会消耗额度，工具调用前系统会请求用户确认。
- 不支持附件参考音频；需要参考音频时说明当前限制。
- 生成完成后，用简短文字说明结果，不要重复 Markdown 音频链接。
