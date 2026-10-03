import type {
  GenerateRequest,
  GenerateResponse,
  ModelCapabilities,
  ModelProvider,
  StreamEvent,
} from "./model-provider.ts";

export interface OpenAiCompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  defaultCapabilities?: Partial<ModelCapabilities>;
  fetchImpl?: typeof fetch;
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export class OpenAiCompatibleProvider implements ModelProvider {
  readonly protocol = "openai-compatible" as const;
  readonly id: string;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #capabilities: ModelCapabilities;

  constructor(config: OpenAiCompatibleConfig) {
    this.id = config.id;
    this.#baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.#apiKey = config.apiKey;
    this.#fetch = config.fetchImpl ?? fetch;
    this.#capabilities = {
      streaming: true,
      tools: true,
      strictJsonSchema: true,
      promptCaching: false,
      accurateUsage: true,
      ...config.defaultCapabilities,
    };
  }

  async listModels(): Promise<string[]> {
    const response = await this.#request("/models", { method: "GET" });
    const body = await response.json() as { data?: { id?: string }[] };
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
    return { ...this.#capabilities };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await this.#request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(toOpenAiRequest(request, false)),
    });
    const body = await response.json() as {
      id?: string;
      choices?: { message?: { content?: string | null; tool_calls?: unknown[] }; finish_reason?: string }[];
      usage?: OpenAiUsage;
    };
    const choice = body.choices?.[0];
    return {
      id: body.id ?? request.taskId,
      text: choice?.message?.content ?? "",
      finishReason: normalizeFinishReason(choice?.finish_reason, Boolean(choice?.message?.tool_calls?.length)),
      usage: normalizeUsage(body.usage),
      rawProviderRequestId: response.headers.get("x-request-id") ?? body.id,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const response = await this.#request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(toOpenAiRequest(request, true)),
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
        for (const frame of frames) yield* parseSseFrame(frame);
      }
      if (buffer.trim()) yield* parseSseFrame(buffer);
    } finally {
      reader.releaseLock();
    }
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${this.#apiKey}`);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await providerError(response);
    return response;
  }
}

function toOpenAiRequest(request: GenerateRequest, stream: boolean): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages.map((message) => ({ role: message.role, content: message.content, ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}) })),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
    ...(request.responseSchema ? { response_format: { type: "json_schema", json_schema: request.responseSchema } } : {}),
    ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ type: "function", function: tool })) } : {}),
  };
}

function normalizeUsage(usage?: OpenAiUsage) {
  return {
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens,
  };
}

function normalizeFinishReason(value?: string, hasToolCalls = false): GenerateResponse["finishReason"] {
  if (hasToolCalls || value === "tool_calls" || value === "function_call") return "tool_call";
  if (value === "length") return "length";
  if (value === "content_filter") return "content_filter";
  if (value === "stop" || value === undefined || value === null) return "stop";
  return "error";
}

function* parseSseFrame(frame: string): Generator<StreamEvent> {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const event = JSON.parse(payload) as {
      choices?: { delta?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
      usage?: OpenAiUsage;
    };
    if (event.usage) yield { type: "usage", usage: normalizeUsage(event.usage) };
    for (const choice of event.choices ?? []) {
      if (choice.delta?.content) yield { type: "text_delta", text: choice.delta.content };
      for (const call of choice.delta?.tool_calls ?? []) {
        if (call.function?.name || call.function?.arguments) yield { type: "tool_call", id: call.id ?? "", name: call.function.name ?? "", arguments: call.function.arguments ?? "" };
      }
      if (choice.finish_reason) yield { type: "done", finishReason: normalizeFinishReason(choice.finish_reason) };
    }
  }
}

async function providerError(response: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await response.json() as { error?: { message?: string }; message?: string };
    detail = body.error?.message ?? body.message ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  const category = response.status === 401 || response.status === 403
    ? "鉴权失败"
    : response.status === 429
      ? "请求过于频繁"
      : response.status >= 500
        ? "模型服务暂时不可用"
        : "模型请求失败";
  return new Error(`${category}（HTTP ${response.status}）${detail ? `：${detail}` : ""}`);
}

