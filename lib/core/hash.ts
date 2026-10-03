const encoder = new TextEncoder();

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableId(namespace: string, value: string): Promise<string> {
  const digest = await sha256Hex(`${namespace}\u0000${value}`);
  return `${namespace}_${digest.slice(0, 24)}`;
}
