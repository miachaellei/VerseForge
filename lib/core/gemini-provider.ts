import type { GenerateRequest, GenerateResponse, ModelCapabilities, ModelProvider, StreamEvent } from "./model-provider.ts";

export interface GeminiProviderConfig {
  id: string;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
type GeminiResponse = {
  responseId?: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { id?: string; name?: string; args?: unknown } }> }; finishReason?: string }>;
  usageMetadata?: GeminiUsage;
  promptFeedback?: { blockReason?: string };
};

export class GeminiProvider implements ModelProvider {
  readonly protocol = "gemini" as const;
  readonly id: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(config: GeminiProviderConfig) {
    this.id = config.id;
    this.#apiKey = config.apiKey;
    this.#baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async listModels(): Promise<string[]> {
    const response = await this.#request("/v1beta/models", { method: "GET" });
    const body = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    return (body.models ?? []).flatMap((model) => model.name && (!model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent")) ? [model.name.replace(/^models\//, "")] : []);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const models = await this.listModels();
      return { ok: true, message: models.length ? `连接成功，可用模型 ${models.length} 个` : "连接成功，但没有返回可生成文本的模型" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "连接失败" };
    }
  }

  async getCapabilities(): Promise<ModelCapabilities> {
    return { streaming: true, tools: true, strictJsonSchema: true, promptCaching: true, accurateUsage: true };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await this.#request(`/v1beta/models/${encodeURIComponent(request.model)}:generateContent`, {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(toGeminiRequest(request)),
    });
    const body = await response.json() as GeminiResponse;
    return normalizeGeminiResponse(body, request.taskId);
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const response = await this.#request(`/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(toGeminiRequest(request)),
    });
    if (!response.body) throw new Error("模型服务商没有返回流式响应体");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) yield* parseGeminiFrame(frame);
      }
      if (buffer.trim()) yield* parseGeminiFrame(buffer);
    } finally {
      reader.releaseLock();
    }
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-goog-api-key", this.#apiKey);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await geminiError(response);
    return response;
  }
}

function toGeminiRequest(request: GenerateRequest): Record<string, unknown> {
  const systems = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = request.messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.role === "tool" ? `[工具结果 ${message.toolCallId ?? ""}]\n${message.content}` : message.content }],
  }));
  return {
    contents,
    ...(systems ? { systemInstruction: { parts: [{ text: systems }] } } : {}),
    generationConfig: {
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
      ...(request.responseSchema ? { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: request.responseSchema.schema } } } : {}),
    },
    ...(request.tools?.length ? { tools: [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) }] } : {}),
  };
}

function normalizeGeminiResponse(body: GeminiResponse, fallbackId: string): GenerateResponse {
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const hasToolCall = parts.some((part) => part.functionCall);
  return {
    id: body.responseId ?? fallbackId,
    text: parts.map((part) => part.text ?? "").join(""),
    finishReason: normalizeGeminiFinish(candidate?.finishReason, hasToolCall, body.promptFeedback?.blockReason),
    usage: normalizeGeminiUsage(body.usageMetadata),
    rawProviderRequestId: body.responseId,
  };
}

function normalizeGeminiUsage(usage?: GeminiUsage) {
  return { inputTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount, cachedInputTokens: usage?.cachedContentTokenCount };
}

function normalizeGeminiFinish(value?: string, hasToolCall = false, blocked?: string): GenerateResponse["finishReason"] {
  if (hasToolCall) return "tool_call";
  if (blocked || value === "SAFETY" || value === "BLOCKLIST" || value === "PROHIBITED_CONTENT") return "content_filter";
  if (value === "MAX_TOKENS") return "length";
  if (value === "STOP" || value === undefined) return "stop";
  return "error";
}

function* parseGeminiFrame(frame: string): Generator<StreamEvent> {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    const body = JSON.parse(payload) as GeminiResponse;
    if (body.usageMetadata) yield { type: "usage", usage: normalizeGeminiUsage(body.usageMetadata) };
    for (const candidate of body.candidates ?? []) {
      let hasToolCall = false;
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) yield { type: "text_delta", text: part.text };
        if (part.functionCall) {
          hasToolCall = true;
          yield { type: "tool_call", id: part.functionCall.id ?? "", name: part.functionCall.name ?? "", arguments: JSON.stringify(part.functionCall.args ?? {}) };
        }
      }
      if (candidate.finishReason) yield { type: "done", finishReason: normalizeGeminiFinish(candidate.finishReason, hasToolCall) };
    }
    if (!body.candidates?.length && body.promptFeedback?.blockReason) yield { type: "done", finishReason: "content_filter" };
  }
}

async function geminiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  const category = response.status === 401 || response.status === 403 ? "鉴权失败" : response.status === 429 ? "请求过于频繁" : response.status >= 500 ? "模型服务暂时不可用" : "模型请求失败";
  return new Error(`${category}（HTTP ${response.status}）${body.error?.message ? `：${body.error.message}` : ""}`);
}
