# 自定义桌宠形象生成

日期：2026-11-16。
状态：macOS 已用真实火山方舟 Key 完成透明 PNG 与 6 状态整套生成验证；Windows 未验证。

## Provider

- 设置入口：设置 → 智能体 → 火山方舟。
- 密钥：沿用 `mqmz.provider-keys.json`，与 MiniMax 一样使用系统加密存储，不下发到渲染进程。
- Key 校验：`GET https://ark.cn-beijing.volces.com/api/v3/models`，无 Key 返回 401，校验不消耗生图额度。
- 桌宠生图：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`。
- 固定模型：`doubao-seedream-5-5-261028`。
- 火山方舟同时作为 Agent 供应商：文本模型 Doubao Seed Evolving、2.1 Pro/Lite/Turbo、2.0 Pro/Lite/Mini；图像模型 Doubao Seedream 5.5。

首次使用前需要在火山方舟控制台开通 Doubao-Seedream-5.5。未开通时接口返回 `has not activated the model`，客户端会提示到控制台开通。

## 透明输出

固定请求参数：

```json
{
  "size": "1K",
  "output_format": "png",
  "background": "transparent",
  "response_format": "b64_json",
  "watermark": false
}
```

Seedream 5.5 支持文生 RGBA 和图生 RGBA，输入参考图不需要自带透明通道。Seedream 5.0 Flash 的文生图不支持 RGBA，图生图要求输入图本身带透明通道，因此不能直接用普通宠物照片生成透明基础形象。

真实验证结果：

- 返回图片：1024×1024 PNG，真实 Alpha，可见区域约 7%–8% 留白。
- `data[].background` 返回 `transparent`。
- 透明边缘在深色、浅色背景上正常，无明显白边。
- 归一化后：448×448，底部锚点固定在 430/448，左右居中。
- 单张生成到预览约 8–16 秒；6 状态整套约 60–70 秒。

## 风格包

内置唯一风格：`src/shared/pet-styles/mqmz-watercolor.json`。

- id：`mqmz-watercolor`
- 名称：麻薯柔和水彩
- 状态：`base / blink / focus / lifted / music / ponder`
- `base` 使用 1–4 张同一只宠物的照片作为参考，建议 2–4 张，可一次多选；其余状态以基础形象为唯一参考。
- 如果宠物穿衣服、戴项圈或配饰，基础形象和其余状态都保留同一套，不换装、不新增。
- 多张照片服装不一致时，以最清晰、出现次数最多的一套为准。
- 提示词已改成通用宠物，不再写死布偶猫的蓝眼睛、奶白色和浅棕重点色。
- `blink` 按“只闭眼，其余不变”派生。
- `focus` 合并了前腿与前爪同色修正。
- 不生成 `look-left`、`curious`；`music-notes` 仍是独立 APNG 浮层。

## 本地处理

代码：

- `src/main/pet-generator.ts`：Ark 参考图编码、透明校验、生成请求。
- `src/main/pet-image.ts`：真实 Alpha 检查、透明边界、448 归一化、底部锚点。
- `src/main/pet-store.ts`：`userData/pets/<id>/` 存取与素材注册。
- `src/renderer/PetCreateWizard.vue`：新建桌宠向导。

生成流程：

1. 选择 1–4 张宠物照片，填写名字，并选择种类（猫、狗、兔子、鸟、仓鼠、其他）。
2. 名称在开始生成前做同名校验：去掉首尾空格、统一大小写和全半角后，不能与已有桌宠、内置麻薯或当前默认名称重复；主进程再次校验。
3. 种类在保存后不可修改，写入 `pet.json`，并进入 Agent 系统提示词的角色信息；视觉形象与种类不强制绑定。
3. 整套生成前确认一次费用。
4. 生成 `base`，校验 1024×1024 与真实 Alpha。
5. 用 `base` 生成其余 5 个状态。
6. 每张保存原始 1024 PNG 到 `source/`，并输出 448 PNG。
7. 全部成功后预览；保存后才切换当前桌宠。

单张重新生成单独确认。基础形象重生成会重置其余状态，避免新旧基础形象混用。

## 智能体接入

- 智能体模型菜单按供应商分组，只对当前选择模型打勾。
- 选择 Doubao Seedream 5.5 只改变 `image_generate` 使用的图像模型，不切换对话模式，输入框内容仍交给文本模型。
- `image_generate` 使用当前会话选择或设置中的默认图像模型；Seedream 只支持单张、1K/2K、png/jpeg。
- 生成桌宠形象始终使用 Doubao Seedream 5.5，不受默认图像模型影响。
- 新建桌宠前检查火山方舟 Key 和 `/models` 中的 Seedream 5.5。无 Key 时跳转设置 → 智能体并展开火山方舟添加表单；Key 有效但模型不可见时提示到火山方舟控制台开通。
- 内置说明型 Skill「桌宠形象生成」位于 `resources/skills/mqmz-pet/pet-generation`，默认启用；它负责解释固定规格和入口，不直接生成或保存桌宠。

## 存储与隐私

```text
userData/pets/<id>/
  pet.json
  base.png
  blink.png
  focus.png
  lifted.png
  music.png
  ponder.png
  source/
    base.png
    ...
```

- `pet.json` 记录名字、种类、风格、模型、创建时间和六个状态文件名。
- 参考照片只保留在临时目录，保存或放弃时删除；应用异常退出后，下次启动清理 `.draft-*` 目录。
- 照片会重新编码为 JPEG，去除原始元数据。
- 当前素材通过本地 `mqmz-media://source/...` 加载，不经过网络。
- 旧桌宠目录保留，便于后续做档案切换。

## 已验证

- 火山方舟 Key 添加、延迟测试、模型列表、删除。
- Seedream 5.5 文生透明 PNG。
- 用一张不透明参考照片生成基础形象，再生成其余 5 个状态。
- 六个状态角色一致、透明背景、448×448、底部锚点。
- 保存后桌宠窗口切换为自定义形象，重启后仍保持。
- 设置页宠物档案与桌宠窗口读取同一套素材。
- 新建桌宠向导、关闭与本地保存。
- 「恢复默认」入口已实现，可切回内置麻薯形象。
- 智能体选择 Doubao Seedream 5.5 作为图像模型后，文本模型仍正常回复，`image_generate` 使用 Seedream 生成 1024×1024 图片。
- 内置说明型 Skill「桌宠形象生成」默认启用。

## 未验证

- Windows x64 的窗口显示、透明边缘和拖拽锚点。
- 2–4 张同一只宠物照片的融合一致性。
- 宠物穿衣服、戴项圈或配饰时的跨状态服装一致性。
- 不同宠物种类（狗、兔等）的一致性。
- 多套形象切换界面与旧素材清理。
- 云端积分、资源包、任务编排和账号归属。
- Agent 技能自主创建桌宠。
