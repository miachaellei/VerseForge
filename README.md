# 声篇工坊：本地小说翻写

当前仓库正在从云端创作演示迁移为本地优先的小说翻写桌面软件。现阶段已落地：

- Tauri 2 桌面壳、独立 Vite 前端、SQLite WAL/外键/版本迁移和系统文件选择器；
- SQLite 项目创建、重命名、完整深复制、归档/恢复、可恢复回收站、命名检查点和故事圣经自动保存；检查点恢复为独立项目，不覆盖当前创作；复制项目会独立复制原文文件、解析快照、分析审核、章节版本、上下文与一致性报告；
- TXT、Markdown、EPUB、文字型 PDF 安全解析，稳定章节/片段 ID、FTS5 检索、质量报告及不可变原文件副本；
- 活动解析快照编辑器：清洗页码/重复页眉页脚/广告/重复段落、连接 PDF 硬换行，支持章节重命名、光标拆分、合并和排序；每次保存重新生成稳定片段 ID，原始文本哈希不变并保留旧解析修订；
- 桌面导入 Worker 支持取消：取消会终止解析子进程，数据库只在完整解析成功后写入，不产生半成品原文；
- 桌面导入显示 Worker 阶段进度（读取、格式解析、章节识别、完成），便于观察大文件导入状态；
- 导入权利确认审计、恶意 EPUB 路径与压缩大小限制、跨项目数据隔离；
- OpenAI 兼容、Anthropic Messages、Gemini GenerateContent 三类统一模型适配器；
- 平台模型通道已接入模型设置和统一请求工厂：复用 OpenAI 兼容协议但使用独立 `platform` 协议标识；客户端支持填写平台网关地址和访问令牌并把令牌放入系统凭据库，充值、支付回调、账户账本、余额查询和用量扣减仍必须由平台服务端实现；
- 平台网关最小账户/充值 API 契约见 [`docs/platform-gateway-contract.md`](docs/platform-gateway-contract.md)，客户端已实现余额查询和充值订单发起；
- 第一期功能验收矩阵见 [`docs/first-phase-acceptance.md`](docs/first-phase-acceptance.md)；
- macOS Keychain / Windows Credential Manager 系统凭据存储，不把 API Key 写入项目或 SQLite；
- 受控 Agent 工具权限与预算契约、AI 任务状态机、幂等键和乐观并发；
- SQLite AI 任务审计与可筛选历史面板，记录输入指纹、模型、状态、Token 用量、输出与失败证据；故事圣经和规划生成使用统一幂等执行层，相同成功输入可复用结果；
- 本地 Token 预算护栏，支持单任务上限、项目每日上限和 BYOK 输入/输出单价参考配置，模型请求前会预估并拦截超额调用；
- 梗概 AI 候选生成、SQLite 草稿/接受/拒绝审批与正式故事圣经版本；
- 新世界观的结构化编辑、AI 一键生成、候选对照和审批入库；
- 新人物、人物关系、地点场景和时间线的结构化 AI 候选、人工审批与项目级正式设定；
- 梗概、世界观和人物字段支持持久化锁定，AI 候选强制保留锁定值；梗概与世界观支持逐字段采用，并在写入正式设定前展示受影响卷、章节、人物和正文；
- Rewrite Canon 的世界观、人物、关系、地点、时间线和正式规划使用带项目加载守卫的防抖自动保存，避免项目切换时写入默认空值；
- 卷、章、场景三级正式规划，一键生成候选、结构校验和审批入库；
- 原作逐章分析估算、稳定证据引用、增量持久化、暂停续跑和逐章审核；
- 将已审核章节聚合为 Source Canon，包含人物、地点、术语、关系、时间线、世界规则、伏笔和待确认项；
- 章节编辑器自动保存、乐观并发、不可变版本历史、恢复和定稿状态；
- 章节版本差异面板：按行展示新增/删除内容，用户可显式恢复指定版本；
- 正文选区级 AI 辅助：润色、扩写、缩写和指令式重写均先生成候选，对比原片段后才可确认替换，避免整章误覆盖；
- 按章节生成会保留 3 个独立候选版本，并写入本地候选表；重启或切换章节后仍可恢复候选，切换对比后再采用，不覆盖当前正文；
- 卷章规划提供本地节奏与结构检查：章节编号连续性、卷目标字数偏差、连续章节推进信号和场景变化不足会在采用前提示；
- 正文生成与选区重写支持取消；取消会中止当前模型请求、标记 AI 任务为 cancelled，并保留当前草稿不变；
- 章节正文生成使用统一模型网关的流式事件，界面实时显示当前场景片段，完成后再形成候选版本；
- 按场景顺序生成章节候选，提供只读原文对照和生成前上下文预览；分层上下文组装、Token 预算、快照留存及未来章节/其他项目信息隔离；
- 章节定稿时自动提取摘要、章末状态变化、新增事实和未决线索；只有人工审核通过的章节记忆才会进入后续章节上下文；
- 章节记忆新增时间化实体状态，记录人物、关系、地点和物品等章末状态，并按生效章节注入后续上下文；
- 带来源引文校验的一致性检查，覆盖人物、时间、世界规则、关系、物品、伏笔、未来泄露和规划偏离；
- TXT、Markdown、基础 DOCX 导出，以及带 CRC/路径/容量校验的 `.shengpian` 项目包导出与恢复；项目包重建故事圣经、原文文本快照、分析审核、规划、章节版本、上下文、AI 审计和一致性报告，但不包含 API Key 或原始 EPUB/PDF 二进制；
- 10 章、100 章、矛盾和提示注入标准回归样本。

Web 核心验证：

```bash
pnpm test:core
pnpm lint
pnpm build
```

本地 Worker 验证：

```bash
cd services/local-worker
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

桌面核心验证与构建：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm desktop-ui:build
pnpm exec tauri build --debug --no-bundle
```

桌面应用把项目、原文快照、分析草稿和故事圣经保存到应用数据目录的 `story-rewriter.sqlite`，原始文件副本位于同目录的 `projects/<project-id>/sources/`。数据库启用 WAL、外键和 FTS5。开发预览继续保留，方便快速进行浏览器界面测试。

发行构建需先使用 Python 3.11+ 安装 worker 依赖和 PyInstaller，再执行：

```bash
STORY_WORKER_PYTHON=/path/to/python3 pnpm desktop:release
```

该命令会生成当前 Rust target triple 对应的 `story-worker` sidecar，并通过发行配置将其纳入安装包。构建脚本会把 PyInstaller 缓存放在项目 target 目录，避免依赖用户目录权限。开发构建在没有 sidecar 时会回退到 `STORY_WORKER_PYTHON` 或 `python3`。当前 macOS arm64 已验证 sidecar 可启动并解析标准 10 章 TXT，`.app` 内含约 10 MiB 的 `story-worker`。

生成标准测试小说：

```bash
pnpm fixtures:generate
```

> 当前安装包的文档解析 Worker 仍依赖 Python 3.11+ 和 `pypdf`。正式发行前必须将 Worker 构建为 macOS / Windows 随包 sidecar，不应把开发机构建成功视为可分发验收。

## 原始 Web 工程说明

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
