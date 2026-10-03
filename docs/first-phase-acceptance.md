# 第一期验收矩阵

## 已在本地客户端验收

| 能力 | 证据 |
| --- | --- |
| 单机桌面运行、SQLite WAL、项目隔离 | `src-tauri` Rust 测试 14 项；macOS `.app` 构建成功 |
| TXT / EPUB / 文字型 PDF 导入 | Worker 测试 7 项；sidecar 解析标准 10 章 TXT 得到 10 章、40 个片段 |
| 原文只读副本、权利确认、解析修订 | `database.rs` 权利审计与 `source-snapshot-editor.test.ts` |
| 原作逐章分析、证据引用、Source Canon | `original-analysis.test.ts`、`source-canon.test.ts` |
| 新世界观、梗概、人物、关系、地点、时间线 AI 候选与审批 | `app/page.tsx` 对应工作台与 SQLite candidate/story bible 持久化 |
| 卷/章/场景规划与质量检查 | `story-plan.test.ts`、`plan-quality.test.ts` |
| 正文流式生成、三候选、选区重写、版本恢复 | 章节工作台与 `text-diff.test.ts` |
| 上下文隔离、章节记忆、时间化实体状态 | `context-assembler.test.ts`、集成管线测试 |
| 一致性检查、导出、项目包恢复 | `consistency-check.test.ts`、`exporters.test.ts`、Rust 数据库测试 |
| OpenAI 兼容 / Anthropic / Gemini / platform 统一接入 | `provider-factory.test.ts`、各适配器测试 |
| 平台余额、充值订单、支付状态确认 | `platform-provider.test.ts`、`docs/platform-gateway-contract.md` |

## 外部上线前置条件

平台充值的支付渠道、回调验签、账户账本、余额扣减和模型用量计费不能安全地由单机客户端实现。客户端已完成网关协议、错误语义和订单状态轮询；上线前必须部署并验收平台网关服务端，尤其是：

1. 支付成功回调只能由服务端验签后入账；
2. 充值订单和模型请求都必须使用服务端幂等键；
3. 模型调用余额扣减以服务端实际用量为准；
4. 402 余额不足不得自动重试模型请求；
5. 令牌、支付密钥和账本数据不得进入桌面项目包。

当前客户端不伪造余额、不本地记账，也不会把服务端未部署描述为已上线。
