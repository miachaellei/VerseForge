import assert from "node:assert/strict";
import test from "node:test";
import { createModelProvider } from "./provider-factory.ts";

const base = { baseUrl: "https://gateway.example.test/v1", apiKey: "secret" };

test("creates every supported provider through one factory", () => {
  assert.equal(createModelProvider({ ...base, protocol: "openai-compatible" }).protocol, "openai-compatible");
  assert.equal(createModelProvider({ ...base, protocol: "anthropic" }).protocol, "anthropic");
  assert.equal(createModelProvider({ ...base, protocol: "gemini" }).protocol, "gemini");
  assert.equal(createModelProvider({ ...base, protocol: "platform" }).protocol, "platform");
});

test("rejects an incomplete provider configuration before a network request", () => {
  assert.throws(() => createModelProvider({ ...base, protocol: "platform", baseUrl: " " }), /网关地址/);
  assert.throws(() => createModelProvider({ ...base, protocol: "platform", apiKey: " " }), /访问令牌/);
});
