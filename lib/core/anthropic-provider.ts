import type { GenerateRequest, GenerateResponse, ModelCapabilities, ModelProvider, StreamEvent } from "./model-provider.ts";

export interface AnthropicProviderConfig {
  id: string;
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

type AnthropicUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };

export class AnthropicProvider implements ModelProvider {
  readonly protocol = "anthropic" as const;
  readonly id: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #apiVersion: string;
  readonly #fetch: typeof fetch;

  constructor(config: AnthropicProviderConfig) {
    this.id = config.id;
    this.#apiKey = config.apiKey;
    this.#baseUrl = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    this.#apiVersion = config.apiVersion ?? "2023-06-01";
    this.#fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async listModels(): Promise<string[]> {
    const response = await this.#request("/v1/models", { method: "GET" });
    const body = await response.json() as { data?: Array<{ id?: string }> };
    return (body.data ?? []).flatMap((model) => model.id ? [model.id] : []);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const models = await this.listModels();
      return { ok: true, message: models.length ? `连接成功，可用模型 ${models.length} 个` : "连接成功，但没有返回模型列表" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "连接失败" };
    }
  }

  async getCapabilities(): Promise<ModelCapabilities> {
    return { streaming: true, tools: true, strictJsonSchema: true, promptCaching: true, accurateUsage: true };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await this.#request("/v1/messages", { method: "POST", signal: request.signal, body: JSON.stringify(toAnthropicRequest(request, false)) });
    const body = await response.json() as {
      id?: string;
      content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>;
      stop_reason?: string;
      usage?: AnthropicUsage;
    };
    const blocks = body.content ?? [];
    const hasToolUse = blocks.some((block) => block.type === "tool_use");
    return {
      id: body.id ?? request.taskId,
      text: blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join(""),
      finishReason: normalizeAnthropicFinish(body.stop_reason, hasToolUse),
      usage: normalizeAnthropicUsage(body.usage),
      rawProviderRequestId: response.headers.get("request-id") ?? body.id,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const response = await this.#request("/v1/messages", { method: "POST", signal: request.signal, body: JSON.stringify(toAnthropicRequest(request, true)) });
    if (!response.body) throw new Error("模型服务商没有返回流式响应体");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const tools = new Map<number, { id: string; name: string }>();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) yield* parseAnthropicFrame(frame, tools);
      }
      if (buffer.trim()) yield* parseAnthropicFrame(buffer, tools);
    } finally {
      reader.releaseLock();
    }
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-api-key", this.#apiKey);
    headers.set("anthropic-version", this.#apiVersion);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await anthropicError(response);
    return response;
  }
}

function toAnthropicRequest(request: GenerateRequest, stream: boolean): Record<string, unknown> {
  const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const messages = request.messages.filter((message) => message.role !== "system").map((message) => message.role === "tool"
    ? { role: "user", content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }] }
    : { role: message.role, content: message.content });
  return {
    model: request.model,
    max_tokens: request.maxOutputTokens ?? 4096,
    messages,
    stream,
    ...(system ? { system } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.responseSchema ? { output_config: { format: { type: "json_schema", schema: request.responseSchema.schema } } } : {}),
    ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters, strict: true })) } : {}),
  };
}

function normalizeAnthropicUsage(usage?: AnthropicUsage) {
  return { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens, cachedInputTokens: usage?.cache_read_input_tokens };
}

function normalizeAnthropicFinish(value?: string | null, hasToolUse = false): GenerateResponse["finishReason"] {
  if (hasToolUse || value === "tool_use") return "tool_call";
  if (value === "max_tokens") return "length";
  if (value === "refusal") return "content_filter";
  if (value === "end_turn" || value === "stop_sequence" || value === undefined || value === null) return "stop";
  return "error";
}

function* parseAnthropicFrame(frame: string, tools: Map<number, { id: string; name: string }>): Generator<StreamEvent> {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    const event = JSON.parse(payload) as {
      type?: string;
      index?: number;
      message?: { usage?: AnthropicUsage };
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
      usage?: AnthropicUsage;
    };
    if (event.type === "message_start" && event.message?.usage) yield { type: "usage", usage: normalizeAnthropicUsage(event.message.usage) };
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && event.index !== undefined) {
      const tool = { id: event.content_block.id ?? "", name: event.content_block.name ?? "" };
      tools.set(event.index, tool);
      yield { type: "tool_call", ...tool, arguments: "" };
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield { type: "text_delta", text: event.delta.text };
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && event.index !== undefined) {
      const tool = tools.get(event.index) ?? { id: "", name: "" };
      yield { type: "tool_call", ...tool, arguments: event.delta.partial_json ?? "" };
    }
    if (event.type === "message_delta") {
      if (event.usage) yield { type: "usage", usage: normalizeAnthropicUsage(event.usage) };
      if (event.delta?.stop_reason) yield { type: "done", finishReason: normalizeAnthropicFinish(event.delta.stop_reason) };
    }
  }
}

async function anthropicError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  const category = response.status === 401 || response.status === 403 ? "鉴权失败" : response.status === 429 ? "请求过于频繁" : response.status >= 500 ? "模型服务暂时不可用" : "模型请求失败";
  return new Error(`${category}（HTTP ${response.status}）${body.error?.message ? `：${body.error.message}` : ""}`);
}
