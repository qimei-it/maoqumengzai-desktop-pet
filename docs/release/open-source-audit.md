# 开源发布审计

日期：2026-11-18
范围：`maoqumengzai-desktop-pet` 全部 git 历史（427 个提交）与当前工作区。

## 方法

- 密钥扫描：gitleaks 8.30.1（darwin arm64），压缩包 SHA-256 与官方 `checksums.txt` 一致（`b40ab0ae…a9aeb6a5`）。
- 扫描命令：`gitleaks detect --source . --redact --no-banner -c .gitleaks.toml`。
- 历史文件清单：`git log --all --pretty=format: --name-only --diff-filter=A`。
- 敏感引用：`git grep` 检查内部主机名、本机绝对路径与疑似凭据路径。
- 大文件：`git rev-list --objects --all | git cat-file --batch-check`，列出超过 10 MB 的 blob。

## 结果

### 密钥扫描

历史中共 1 条命中：

- `tests/unit/redact.test.ts:23`，规则 `jwt`。
- 内容是为「脱敏函数」单测准备的合成 JWT（`{"alg":"HS256"}` / `{"sub":"1234567890"}`，签名仅为占位字符串），不是真实凭据。
- 已在 `.gitleaks.toml` 增加**精确字符串** allowlist，而不是整文件放行。
- 修正后复扫：427 个提交、约 65.22 MB，**0 命中**；工作区同样 0 命中。

### 文件与内容

- 历史新增文件中没有 `.env`、`.npmrc`、`.netrc`、`id_rsa`、`.pem`、`.key`、`.p12`、`.pfx` 或 `credentials.json`。
- `resources/skills/nature/nature-downloader/scripts/lib/credentials.mjs` 是第三方技能里**读取本地凭据文件**的代码，不含任何凭据值。
- 仓库包含 FFmpeg 二进制（macOS dylib 16.1 MB、Windows dll 19.7 MB），是离线格式转换的内置引擎，属产品组成；许可见 `THIRD-PARTY-NOTICES.md`。
- `.gitignore` 覆盖 `.env`、`out`、`dist`、`output`、`test-results` 等构建与本地产物。

### 用户与机器信息

- 全部 427 个提交的作者统一为 `Yifan Li <yifan.li@qimeistudio.cn>`（公司邮箱）。
- 已清理项目自有文件中的本机绝对路径：
  - `docs/v1-implementation-handoff.md`
  - `resources/pet/ragdoll/source/*.txt`
- **仍保留**：`AGENTS.md` 与 `docs/p0-validation-progress.md` 中的内部 GitLab 主机名 `gitlab.qimei.com`。它只是远端地址，不含凭据；公开版是否需要保留由维护者决定。
- 第三方技能样例中的 `/Users/...` 与示例邮箱未改动，属上游内容。

## 结论

- 未发现真实密钥、私有凭据或私有仓库内容。
- 修正 allowlist 后，CI 的 `Secret scan` 任务可通过。
- 公开前只剩一个可选项：确认是否移除内部 GitLab 地址；其余可以发布。
