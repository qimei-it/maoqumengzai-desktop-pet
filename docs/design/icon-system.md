# 图标规范：Lucide 与 Firefox Emoji

确认日期：2026-11-09（Asia/Shanghai）。按用户要求，桌面项目沿用毛趣映画的 Lucide.dev + Firefox Emoji 方案。

## 当前实现

功能性图标使用官方 [Lucide Vue 包](https://lucide.dev/guide/vue/getting-started) `@lucide/vue@1.70.0`，按图标名称导入，在本地渲染为 SVG，随应用打包。统一 `viewBox="0 0 24 24"`、2px 基准描边、圆端点与 `currentColor`，继承面板语义主题色。按钮保留文字或可访问名称，装饰图标标记 `aria-hidden`，不参与焦点。

| 使用位置 | Lucide 图标 |
| --- | --- |
| 关闭文件卡片 | X |
| 文件卡片、原生拖出预览 | File |
| 空置物架/添加文件提示 | File Plus Corner |
| 文件拖动手柄 | Grip Vertical |
| 桌宠接收文件区域 | Folder Input |
| 开发诊断中的文件空态 | Inbox |
| 继续选择文件 | Plus |
| 临时交互标记与系统托盘 | Paw Print |

原有手绘路径、字符代图标以及托盘像素方块已替换。临时 Paw Print 是 P0 交互标记，正式布偶猫/柯基仍按已确认素材流程制作，不以图标替代宠物动画。

## 原生图标与离线分发

Electron 系统托盘/拖出接口使用同源 SVG 导出的 PNG。SVG 来自官方 Vue 组件，图形路径保持原样；通过本地 Electron 渲染导出 20/40px 托盘与 32/64px 文件图标，校验尺寸和非透明像素，保存在 `resources/icons/`。构建配置将图标与许可证复制为离线资源；用户安装后无需下载图标或图标字体。

维护命令：

```sh
npm run generate:icons
npm run check:icons
```

`generate:icons` 是开发维护命令，需要图形桌面与已经安装的开发依赖；正常安装、启动和构建使用仓库中已导出的资源。SVG 原件及 PNG 派生均保留，便于复核来源。图标检查已加入 `npm run build`。

## Firefox Emoji 使用规则

Firefox Emoji 用于后续适合的情绪、活动或业务插画型图标，沿用小程序的素材方案；按需使用官方原图、本地保存并逐项记录来源和署名。功能性线性图标继续使用 Lucide，避免字体 Emoji 受到系统字形差异影响。本次尚无需要新增的彩色表情素材，没有为替换功能图标额外引入 Firefox Emoji 文件。

小程序参考依据：`maoquyinghua-frontend/docs/assets-attribution.md`，其中已逐项登记 Lucide 与 Firefox Emoji 来源。本轮只读取该文件，未修改小程序仓库。

## 版权与验证

- Lucide 来源与许可：[Lucide](https://lucide.dev/license)。完整上游许可证已保留在 [lucide-ISC.txt](../../resources/licenses/lucide-ISC.txt)，包括源文件中的 ISC 与 Feather 派生图标 MIT 声明，并随安装包分发。
- Firefox Emoji 来源：[Mozilla FxEmoji](https://mozilla.github.io/fxemoji/)。首次新增素材时继续逐项核实许可与修改记录，不把整个素材库的使用范围推定为已核验。
- 本轮验证包含 SVG 来源/属性、图标随三套主题着色、原生图标资源、透明命中、文件卡片拖动事件及原有文件功能回归。原生拖出落地与 Windows/Intel/最低系统仍按 P0 原记录待验收。
- 实测结果：构建、图标/主题检查、9 项单元测试与 13 项 Electron 集成测试全部通过（macOS 27.0.1 arm64）。替换后的透明命中回归暴露了原生缩放与图像布局更新的时序问题，已在窗口 resize 时重新测量命中区域并复验通过。
