import assert from "node:assert/strict";
import test from "node:test";
import { PlatformGatewayError, PlatformProvider } from "./platform-provider.ts";

test("platform provider keeps a separate protocol for product billing", () => {
  const provider = new PlatformProvider({ baseUrl: "https://gateway.example.test/v1", apiKey: "session-token" });
  assert.equal(provider.protocol, "platform");
  assert.equal(provider.id, "platform-gateway");
});

test("platform account and checkout APIs stay outside the model request contract", async () => {
  const requests: string[] = [];
  const provider = new PlatformProvider({
    baseUrl: "https://gateway.example.test/v1",
    apiKey: "secret",
    fetchImpl: async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).endsWith("/account")) return Response.json({ accountId: "acct-1", balanceMinor: 1250, currency: "CNY" });
      if (String(input).includes("/billing/orders/")) return Response.json({ orderId: "order-1", status: "paid", amountMinor: 5000, currency: "CNY", creditedAt: "2026-09-30T09:05:00Z" });
      return Response.json({ orderId: "order-1", checkoutUrl: "https://pay.example.test/order-1", amountMinor: 5000, currency: "CNY" });
    },
  });
  assert.deepEqual(await provider.getAccount(), { accountId: "acct-1", balanceMinor: 1250, currency: "CNY" });
  assert.deepEqual(await provider.createCheckout({ amountMinor: 5000 }), { orderId: "order-1", checkoutUrl: "https://pay.example.test/order-1", amountMinor: 5000, currency: "CNY" });
  assert.deepEqual(await provider.getCheckoutStatus("order-1"), { orderId: "order-1", status: "paid", amountMinor: 5000, currency: "CNY", creditedAt: "2026-09-30T09:05:00Z" });
  assert.deepEqual(requests, ["GET https://gateway.example.test/v1/account", "POST https://gateway.example.test/v1/billing/checkout", "GET https://gateway.example.test/v1/billing/orders/order-1"]);
});

test("maps platform billing errors without exposing the bearer token", async () => {
  const provider = new PlatformProvider({ id: "platform", baseUrl: "https://gateway.example.test/v1", apiKey: "do-not-leak", fetchImpl: async () => Response.json({ message: "low balance" }, { status: 402 }) });
  await assert.rejects(provider.getAccount(), (error: unknown) => error instanceof PlatformGatewayError && error.code === "insufficient_balance" && /充值/.test(error.message) && !error.message.includes("do-not-leak"));
});

test("platform connection test preserves actionable gateway errors", async () => {
  const provider = new PlatformProvider({ id: "platform", baseUrl: "https://gateway.example.test/v1", apiKey: "secret", fetchImpl: async () => Response.json({ message: "insufficient" }, { status: 402 }) });
  const result = await provider.testConnection();
  assert.equal(result.ok, false);
  assert.match(result.message, /余额不足/);
});
