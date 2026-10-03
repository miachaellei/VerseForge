import { OpenAiCompatibleProvider, type OpenAiCompatibleConfig } from "./openai-compatible-provider.ts";
import type { GenerateRequest, GenerateResponse, ModelCapabilities, ModelProvider, StreamEvent } from "./model-provider.ts";

export interface PlatformAccount {
  accountId: string;
  displayName?: string;
  balanceMinor: number;
  currency: string;
  refreshedAt?: string;
}

export interface PlatformCheckout {
  orderId: string;
  checkoutUrl: string;
  amountMinor: number;
  currency: string;
  expiresAt?: string;
}

export interface PlatformCheckoutRequest {
  amountMinor: number;
  currency?: string;
}

export type PlatformCheckoutState = "pending" | "paid" | "expired" | "failed";

export interface PlatformCheckoutStatus {
  orderId: string;
  status: PlatformCheckoutState;
  amountMinor: number;
  currency: string;
  creditedAt?: string;
}

export class PlatformGatewayError extends Error {
  readonly status: number;
  readonly code: "unauthorized" | "insufficient_balance" | "rate_limited" | "request_failed";

  constructor(status: number, message: string) {
    super(message);
    this.name = "PlatformGatewayError";
    this.status = status;
    this.code = status === 401 || status === 403 ? "unauthorized" : status === 402 ? "insufficient_balance" : status === 429 ? "rate_limited" : "request_failed";
  }
}

/**
 * Product-owned model channel. The platform gateway intentionally reuses the
 * OpenAI-compatible wire format while exposing a distinct protocol so billing
 * and routing never leak into business agents.
 */
export class PlatformProvider implements ModelProvider {
  readonly protocol = "platform" as const;
  readonly id: string;
  readonly #delegate: OpenAiCompatibleProvider;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(config: Omit<OpenAiCompatibleConfig, "id"> & { id?: string }) {
    this.id = config.id ?? "platform-gateway";
    this.#baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.#apiKey = config.apiKey;
    this.#fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#delegate = new OpenAiCompatibleProvider({ ...config, id: this.id });
  }

  listModels(): Promise<string[]> { return this.#delegate.listModels(); }
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const models = await this.listModels();
      return { ok: true, message: models.length ? `连接成功，可用模型 ${models.length} 个` : "连接成功，但没有返回模型列表" };
    } catch (error) {
      const mapped = mapModelError(error);
      return { ok: false, message: mapped.message };
    }
  }
  getCapabilities(): Promise<ModelCapabilities> { return this.#delegate.getCapabilities(); }
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    try { return await this.#delegate.generate(request); } catch (error) { throw mapModelError(error); }
  }
  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    try {
      for await (const event of this.#delegate.stream(request)) yield event;
    } catch (error) { throw mapModelError(error); }
  }

  async getAccount(signal?: AbortSignal): Promise<PlatformAccount> {
    const response = await this.#request("/account", { method: "GET", signal });
    const value = await response.json() as Partial<PlatformAccount>;
    if (typeof value.accountId !== "string" || typeof value.balanceMinor !== "number" || !Number.isFinite(value.balanceMinor) || value.balanceMinor < 0 || typeof value.currency !== "string") {
      throw new Error("平台账户接口返回格式无效");
    }
    return { accountId: value.accountId, ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}), balanceMinor: value.balanceMinor, currency: value.currency, ...(typeof value.refreshedAt === "string" ? { refreshedAt: value.refreshedAt } : {}) };
  }

  async createCheckout(input: PlatformCheckoutRequest, signal?: AbortSignal): Promise<PlatformCheckout> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("充值金额必须是正整数（最小货币单位）");
    const response = await this.#request("/billing/checkout", { method: "POST", signal, body: JSON.stringify(input) });
    const value = await response.json() as Partial<PlatformCheckout>;
    if (typeof value.orderId !== "string" || typeof value.checkoutUrl !== "string" || typeof value.amountMinor !== "number" || typeof value.currency !== "string") throw new Error("充值接口返回格式无效");
    return { orderId: value.orderId, checkoutUrl: value.checkoutUrl, amountMinor: value.amountMinor, currency: value.currency, ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}) };
  }

  async getCheckoutStatus(orderId: string, signal?: AbortSignal): Promise<PlatformCheckoutStatus> {
    if (!orderId.trim() || !/^[A-Za-z0-9._:-]{1,160}$/.test(orderId)) throw new Error("充值订单号无效");
    const response = await this.#request(`/billing/orders/${encodeURIComponent(orderId)}`, { method: "GET", signal });
    const value = await response.json() as Partial<PlatformCheckoutStatus>;
    if (typeof value.orderId !== "string" || !["pending", "paid", "expired", "failed"].includes(String(value.status)) || typeof value.amountMinor !== "number" || typeof value.currency !== "string") throw new Error("充值订单状态格式无效");
    return { orderId: value.orderId, status: value.status as PlatformCheckoutState, amountMinor: value.amountMinor, currency: value.currency, ...(typeof value.creditedAt === "string" ? { creditedAt: value.creditedAt } : {}) };
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${this.#apiKey}`);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      let detail = "";
      try { detail = String((await response.json() as { message?: unknown }).message ?? ""); } catch { /* keep a stable redacted error */ }
      throw new PlatformGatewayError(response.status, platformMessage(response.status, detail));
    }
    return response;
  }
}

function mapModelError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  const message = error instanceof Error ? error.message : "平台模型请求失败";
  const status = Number(message.match(/HTTP (\d{3})/)?.[1] ?? 0);
  return status ? new PlatformGatewayError(status, platformMessage(status)) : error instanceof Error ? error : new Error(message);
}

function platformMessage(status: number, detail = ""): string {
  const message = status === 401 || status === 403
    ? "平台访问令牌无效或账户无权使用该模型"
    : status === 402
      ? "平台余额不足，请先充值后再生成"
      : status === 429
        ? "平台请求过于频繁，请稍后重试"
        : `平台网关请求失败（HTTP ${status}）`;
  return detail && !message.includes(detail) ? `${message}：${detail}` : message;
}
