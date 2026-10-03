import { AnthropicProvider } from "./anthropic-provider.ts";
import { GeminiProvider } from "./gemini-provider.ts";
import type { ModelProtocol, ModelProvider } from "./model-provider.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.ts";
import { PlatformProvider } from "./platform-provider.ts";

export interface ModelProviderConfig {
  protocol: ModelProtocol;
  baseUrl: string;
  apiKey: string;
  id?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Single provider boundary shared by UI and future Agent workers.
 * Provider-specific request normalization stays inside each adapter.
 */
export function createModelProvider(config: ModelProviderConfig): ModelProvider {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl || !config.apiKey.trim()) throw new Error("请先填写模型网关地址和访问令牌");
  const id = config.id ?? `${config.protocol}-session`;
  const adapterConfig = { id, baseUrl, apiKey: config.apiKey, fetchImpl: config.fetchImpl };
  if (config.protocol === "platform") return new PlatformProvider(adapterConfig);
  if (config.protocol === "anthropic") return new AnthropicProvider(adapterConfig);
  if (config.protocol === "gemini") return new GeminiProvider(adapterConfig);
  return new OpenAiCompatibleProvider(adapterConfig);
}
