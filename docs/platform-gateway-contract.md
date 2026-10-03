# 平台模型网关最小契约

桌面端的 `platform` 协议使用 OpenAI 兼容接口生成内容，并额外调用以下账户接口。所有请求都使用 `Authorization: Bearer <platform-token>`；令牌只保存在系统凭据库，不进入项目数据库、备份或 AI 审计输入。

## 模型接口

网关必须实现 OpenAI 兼容的：

- `GET /v1/models`
- `POST /v1/chat/completions`

`chat/completions` 需要支持 `stream_options.include_usage`，否则桌面端仍能生成，但无法记录准确的流式用量。

## 账户与充值

### `GET /v1/account`

响应：

```json
{
  "accountId": "acct_123",
  "displayName": "创作者",
  "balanceMinor": 1250,
  "currency": "CNY",
  "refreshedAt": "2026-09-30T09:00:00Z"
}
```

`balanceMinor` 是最小货币单位，必须是非负整数。客户端只展示查询结果，不把余额当作本地授权依据。

### `POST /v1/billing/checkout`

请求：

```json
{
  "amountMinor": 5000,
  "currency": "CNY"
}
```

响应：

```json
{
  "orderId": "ord_123",
  "checkoutUrl": "https://pay.example.com/ord_123",
  "amountMinor": 5000,
  "currency": "CNY",
  "expiresAt": "2026-09-30T09:30:00Z"
}
```

服务端必须使用 `accountId + 幂等键` 防止重复下单，并在支付渠道回调验签成功后写入不可变账本。客户端不接收或处理支付密钥，也不自行增加余额。

### `GET /v1/billing/orders/{orderId}`

响应中的 `status` 只能是 `pending`、`paid`、`expired` 或 `failed`。客户端收到 `paid` 后才刷新账户余额；`pending` 不能视为充值成功。

## 失败与安全要求

- `401/403` 表示令牌无效或账户无权使用模型；不得在错误正文中回显令牌。
- `402` 表示余额不足；客户端应提示充值，不应自动重试生成请求。
- `429` 表示限流；响应应带 `Retry-After`，客户端由任务重试策略决定是否重试。
- 余额扣减应与一次模型请求绑定服务端幂等键，不能依赖客户端 Token 估算。
