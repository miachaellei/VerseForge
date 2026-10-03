import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.ts";

test("normalizes models, structured output, tools, usage, and request id", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith("/models")) return Response.json({ data: [{ id: "writer" }, { id: "fast" }] });
    return Response.json({ id: "completion-1", choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 3 } } }, { headers: { "x-request-id": "request-1" } });
  };
  const provider = new OpenAiCompatibleProvider({ id: "custom", baseUrl: "https://example.test/v1/", apiKey: "secret", fetchImpl });

  assert.deepEqual(await provider.listModels(), ["writer", "fast"]);
  const response = await provider.generate({
    taskId: "task-1",
    model: "writer",
    messages: [{ role: "user", content: "生成梗概" }],
    responseSchema: { name: "synopsis", schema: { type: "object" }, strict: true },
    tools: [{ name: "get_canon", description: "读取设定", parameters: { type: "object" } }],
  });

  assert.equal(response.text, "{\"ok\":true}");
  assert.deepEqual(response.usage, { inputTokens: 12, outputTokens: 5, cachedInputTokens: 3 });
  assert.equal(response.rawProviderRequestId, "request-1");
  const body = JSON.parse(String(requests[1].init?.body));
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.tools[0].type, "function");
  assert.equal(new Headers(requests[1].init?.headers).get("authorization"), "Bearer secret");
});

test("normalizes streaming text, tool calls, usage, and completion", async () => {
  const streamBody = [
    'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
    '',
    'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"get_canon","arguments":"{\\"id\\":"}}]},"finish_reason":null}]}',
    '',
    'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2}}',
    '',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    '',
  ].join("\n");
  const provider = new OpenAiCompatibleProvider({ id: "custom", baseUrl: "https://example.test/v1", apiKey: "secret", fetchImpl: async () => new Response(streamBody, { headers: { "content-type": "text/event-stream" } }) });
  const events = [];
  for await (const event of provider.stream({ taskId: "task-2", model: "writer", messages: [{ role: "user", content: "继续" }] })) events.push(event);

  assert.deepEqual(events, [
    { type: "text_delta", text: "你" },
    { type: "tool_call", id: "call-1", name: "get_canon", arguments: '{"id":' },
    { type: "usage", usage: { inputTokens: 8, outputTokens: 2, cachedInputTokens: undefined } },
    { type: "done", finishReason: "stop" },
  ]);
});

test("returns a normalized authentication error without exposing the key", async () => {
  const provider = new OpenAiCompatibleProvider({ id: "custom", baseUrl: "https://example.test/v1", apiKey: "never-log-this", fetchImpl: async () => Response.json({ error: { message: "invalid key" } }, { status: 401 }) });
  const result = await provider.testConnection();
  assert.equal(result.ok, false);
  assert.match(result.message, /鉴权失败/);
  assert.doesNotMatch(result.message, /never-log-this/);
});

