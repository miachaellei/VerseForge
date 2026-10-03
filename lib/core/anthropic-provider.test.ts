import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicProvider } from "./anthropic-provider.ts";

test("normalizes Anthropic messages, schema, tools, and usage", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new AnthropicProvider({ id: "anthropic", apiKey: "secret", fetchImpl: async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/v1/models")) return Response.json({ data: [{ id: "claude-writer" }] });
    return Response.json({ id: "msg-1", content: [{ type: "text", text: "{\"ok\":true}" }], stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 6, cache_read_input_tokens: 8 } }, { headers: { "request-id": "request-1" } });
  } });
  assert.deepEqual(await provider.listModels(), ["claude-writer"]);
  const response = await provider.generate({ taskId: "task-1", model: "claude-writer", messages: [{ role: "system", content: "系统" }, { role: "user", content: "生成" }], responseSchema: { name: "result", schema: { type: "object" } }, tools: [{ name: "get_canon", description: "读取设定", parameters: { type: "object" } }] });
  assert.equal(response.text, "{\"ok\":true}");
  assert.equal(response.rawProviderRequestId, "request-1");
  assert.deepEqual(response.usage, { inputTokens: 20, outputTokens: 6, cachedInputTokens: 8 });
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body.system, "系统");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.tools[0].input_schema.type, "object");
  const headers = new Headers(calls[1].init?.headers);
  assert.equal(headers.get("x-api-key"), "secret");
  assert.equal(headers.get("anthropic-version"), "2023-06-01");
});

test("normalizes Anthropic text and incremental tool streaming", async () => {
  const stream = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"get_canon"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"id\\":1}"}}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}',
    "",
  ].join("\n\n");
  const provider = new AnthropicProvider({ id: "anthropic", apiKey: "secret", fetchImpl: async () => new Response(stream) });
  const events = [];
  for await (const event of provider.stream({ taskId: "task", model: "claude", messages: [{ role: "user", content: "继续" }] })) events.push(event);
  assert.deepEqual(events, [
    { type: "usage", usage: { inputTokens: 9, outputTokens: undefined, cachedInputTokens: undefined } },
    { type: "text_delta", text: "你好" },
    { type: "tool_call", id: "tool-1", name: "get_canon", arguments: "" },
    { type: "tool_call", id: "tool-1", name: "get_canon", arguments: '{"id":1}' },
    { type: "usage", usage: { inputTokens: undefined, outputTokens: 3, cachedInputTokens: undefined } },
    { type: "done", finishReason: "tool_call" },
  ]);
});
