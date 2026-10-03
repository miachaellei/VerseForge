import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "./gemini-provider.ts";

test("normalizes Gemini models, schema, tools, and usage", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new GeminiProvider({ id: "gemini", apiKey: "secret", fetchImpl: async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/v1beta/models")) return Response.json({ models: [{ name: "models/gemini-writer", supportedGenerationMethods: ["generateContent"] }, { name: "models/embed", supportedGenerationMethods: ["embedContent"] }] });
    return Response.json({ responseId: "response-1", candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4, cachedContentTokenCount: 2 } });
  } });
  assert.deepEqual(await provider.listModels(), ["gemini-writer"]);
  const response = await provider.generate({ taskId: "task", model: "gemini-writer", messages: [{ role: "system", content: "系统" }, { role: "user", content: "生成" }], responseSchema: { name: "result", schema: { type: "object" } }, tools: [{ name: "get_canon", description: "读取设定", parameters: { type: "object" } }] });
  assert.equal(response.text, "{\"ok\":true}");
  assert.deepEqual(response.usage, { inputTokens: 11, outputTokens: 4, cachedInputTokens: 2 });
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body.systemInstruction.parts[0].text, "系统");
  assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
  assert.equal(body.tools[0].functionDeclarations[0].name, "get_canon");
  assert.equal(new Headers(calls[1].init?.headers).get("x-goog-api-key"), "secret");
});

test("normalizes Gemini streaming text, tool calls, usage, and finish", async () => {
  const stream = [
    'data: {"candidates":[{"content":{"parts":[{"text":"你"}]}}]}',
    '',
    'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"call-1","name":"get_canon","args":{"id":1}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":2}}',
    '',
  ].join("\n");
  const provider = new GeminiProvider({ id: "gemini", apiKey: "secret", fetchImpl: async () => new Response(stream) });
  const events = [];
  for await (const event of provider.stream({ taskId: "task", model: "gemini", messages: [{ role: "user", content: "继续" }] })) events.push(event);
  assert.deepEqual(events, [
    { type: "text_delta", text: "你" },
    { type: "usage", usage: { inputTokens: 7, outputTokens: 2, cachedInputTokens: undefined } },
    { type: "tool_call", id: "call-1", name: "get_canon", arguments: '{"id":1}' },
    { type: "done", finishReason: "tool_call" },
  ]);
});
