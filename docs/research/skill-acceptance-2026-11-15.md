# 默认技能真实对话验收（2026-11-15）

## 方法

- 使用应用内已配置的 DeepSeek Key，`deepseek-flash`、推理强度「低」、批准模式「完全访问」。
- 每次新建临时会话，要求模型先 `skill_load`，再按技能说明做一个最小示例，最多 5 步。
- 缺少 API Key、外部 CLI 或服务时必须直接说明；不修改工作区。
- 在独立 `MQMZ_DATA_DIR` 中执行，不写入日常会话；临时数据在验收后保留于系统临时目录，未上传。

## 结果

默认启用 36 个，全部完成真实请求；验收后移除了 26 个依赖 claude-seo CLI 的 SEO 技能，当前默认启用 35 个。

| 结果 | 数量 | 说明 |
| --- | --- | --- |
| 通过 | 32 | `skill_load` 成功，未出现工具错误，或错误已修复 |
| 有警告 | 4 | 技能可加载，但依赖外部 CLI 或 Python 包 |

首轮 27 通过、9 警告。修复 `nature-shared` 共享层和依赖标识后，复验 5 个转为通过。随后删除依赖 claude-seo CLI 的 SEO 技能，并跳过 `skill-scanner` 自扫描，剩余 2 个依赖警告。

## 剩余警告

| 技能 | 现象 | 结论 |
| --- | --- | --- |
| `xlsx` | `openpyxl` 未安装 | 标记「需要 Python openpyxl」 |
| `ui-ux-pro-max` | 需要本机 Python 执行 `scripts/search.py` | 标记「需要 Python 3 与技能脚本」 |

## 已修复

- `nature-*` 的 10 个技能此前引用 `../nature-shared`，被技能目录边界拒绝；已将共享层复制为技能内 `shared/` 并改写引用。
- `ads-audit`、`docx` 在复验中通过。
- 内置清单移除 5 组同名重复技能，并删除 26 个依赖 claude-seo CLI 的 SEO 技能，当前 683 个内置、35 个默认启用。
- `skill-scanner` 扫描自身规则文档时会命中示例文本；已按内置技能 ID 跳过自扫描，其他技能仍正常扫描。

## 后续

- `xlsx`、`ui-ux-pro-max` 若要开箱即用，需要在安装包内提供 Python 依赖或改为纯 Node 实现。
- 本次为真实模型调用验收，不等同于 Windows x64 实机验收。
