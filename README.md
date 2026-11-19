# 毛趣萌仔

毛趣萌仔是「毛趣映画」的桌面宠物客户端：一只常驻桌面的宠物，加上番茄钟、喝水与久坐提醒、待办、文件置物架、剪贴板、截图、格式转换、音乐控制和邮箱收发。

- **本地优先**：日常动画、提醒与工具全部在本机执行，不调用模型，数据默认只存在本机。
- **免账号**：所有本地功能不需要登录。
- **开源**：客户端代码以 [MIT 许可](LICENSE) 发布。

## 下载

安装包从官网下载：<https://mqmz.qimeistudio.com/>

| 平台 | 架构 | 最低系统 |
| --- | --- | --- |
| macOS | Apple Silicon（arm64） | macOS 13 Ventura |
| Windows | x64 | Windows 10 22H2、Windows 11 |

macOS Intel 不在支持范围内，不提供构建。Windows ARM 同样不在支持范围内。

## 功能

| 模块 | 内容 |
| --- | --- |
| 桌宠 | 待机、拖动、听歌、思考与专注姿态；眨眼与呼吸动效；可缩放、可置顶 |
| 自定义桌宠 | 上传 1–4 张照片生成同一只宠物的六个状态，按哺乳、鸟、爬宠、节肢、水族分类绘制 |
| 番茄钟 | 专注/短休/长休、自定义时长、按天统计、宠物状态联动 |
| 提醒 | 喝水与久坐/护眼提醒，可配置时段、间隔与免打扰 |
| 待办 | 清单与分组、截止时间、重复规则、到期提醒 |
| 文件置物架 | 拖入、打开、定位、拖出、移出索引（不动源文件）、一键清空 |
| 剪贴板 | 文本与图片历史、搜索、固定、保留期与容量上限 |
| 截图 | 快捷键框选、多屏、预览、复制、保存、联动置物架 |
| 格式转换 | 图片、PDF、Office、OFD、影音、压缩包，内置引擎离线可用 |
| 音乐 | QQ 音乐、网易云、Apple Music、酷狗的控制与歌词；可选 AI 互动文案 |
| 邮件 | QQ、163、126、Gmail 的收件、正文、附件与发送，含数字验证码识别 |
| 智能体 | 自备 Key 的对话与工具调用，可操作本机的置物架、待办、转换等 |
| 数据 | 每日自动备份、手动导出与恢复快照 |

## 从源码构建

需要 Node.js 24 或更新版本，以及可用的图形桌面会话。

```sh
npm ci
node node_modules/electron/install.js
npm run dev
```

打包：

```sh
npm run pack:mac   # dist/mqmz-<version>-arm64.dmg
npm run pack:win   # dist/mqmz-<version>-setup.exe
```

`pack:mac` 在 macOS 上执行，`pack:win` 可在 Windows 上执行，也可以在 macOS 上交叉构建 NSIS 安装包。打包完成后用 `npm run update:manifest` 生成应用内更新清单。

## 应用内更新

客户端读取 `https://mqmz.qimeistudio.com/latest.json`，比对版本后下载对应平台的安装包，校验 SHA-256，再打开安装程序并退出——macOS 上由你把它拖进「应用程序」，Windows 上运行安装向导。下次启动时如果版本已经更新，客户端会把下载好的安装包移进废纸篓；没装成则保留，下次再说。

没有使用 Squirrel 式自动替换：macOS 上那套机制在当前分发方式下不可靠。清单生成见 `scripts/update-manifest.mjs`（`npm run update:manifest`），发布步骤见 `docs/release/v1.0.0.md`。

开发模式下（未打包）不检查更新。

站点根目录需要能被直接访问到 `latest.json` 与安装包；如果官网是单页应用，不要把更新文件纳入前端路由回退。

## 数据与隐私

本地数据默认不上传，也没有遥测或崩溃上报。只有在你自己配置了第三方服务时，客户端才会直接连接对应服务。完整说明见 [隐私政策](docs/privacy-policy.md)。

本地数据位于 `~/Library/Application Support/mqmz-desktop`（macOS）或 `%LOCALAPPDATA%\mqmz-desktop`（Windows）。在「设置 → 数据」可以删除全部本地数据；卸载默认保留数据，Windows 卸载向导会询问是否一并删除，macOS 可在 DMG 中运行「卸载.command」按提示操作。

## 许可

- 客户端代码：[MIT](LICENSE)
- 第三方组件、引擎、图标与素材：[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 与 `resources/licenses/`

许可证只覆盖代码，不覆盖线上服务与用户数据。官方名称、官方服务与域名由运营方保留，第三方构建不代表获得官方服务授权。

## 开发资料

- [第一版需求与实施交接](docs/archive/v1-implementation-handoff.md)
- [开源策略与功能开放边界](docs/open-source-strategy.md)
- [57 项验收映射](docs/archive/v1-acceptance-matrix.md)
- [双平台支持矩阵](docs/platform-support-matrix.md)
- [技术方案](docs/technical-architecture.md)
- [面板样式规范](docs/design/panel-style-contract.md)
- [图标规范](docs/design/icon-system.md)
- [自定义桌宠形象生成](docs/research/pet-generation.md)
- [智能体 Harness](docs/research/agent-harness.md)
