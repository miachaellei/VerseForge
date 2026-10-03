export type ModelProtocol = "openai-compatible" | "anthropic" | "gemini" | "platform";

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  strictJsonSchema: boolean;
  promptCaching: boolean;
  accurateUsage: boolean;
  maxContextTokens?: number;
  maxOutputTokens?: number;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GenerateRequest {
  taskId: string;
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: JsonSchemaDefinition;
  tools?: ModelToolDefinition[];
  signal?: AbortSignal;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface GenerateResponse {
  id: string;
  text: string;
  finishReason: "stop" | "length" | "tool_call" | "content_filter" | "error";
  usage: ModelUsage;
  rawProviderRequestId?: string;
}

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; arguments: string; id: string }
  | { type: "usage"; usage: ModelUsage }
  | { type: "done"; finishReason: GenerateResponse["finishReason"] };

export interface ModelProvider {
  readonly id: string;
  readonly protocol: ModelProtocol;
  listModels(): Promise<string[]>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  getCapabilities(model: string): Promise<ModelCapabilities>;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>;
}

export class ModelProviderRegistry {
  readonly #providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (this.#providers.has(provider.id)) throw new Error(`模型服务商已注册：${provider.id}`);
    this.#providers.set(provider.id, provider);
  }

  get(providerId: string): ModelProvider {
    const provider = this.#providers.get(providerId);
    if (!provider) throw new Error(`未知模型服务商：${providerId}`);
    return provider;
  }

  list(): ModelProvider[] {
    return [...this.#providers.values()];
  }
}

