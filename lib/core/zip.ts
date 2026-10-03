const encoder = new TextEncoder();

export interface ZipEntry {
  name: string;
  data: string | Uint8Array;
}

export interface ZipReadLimits {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
}

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  if (!entries.length) throw new Error("ZIP 至少需要一个文件");
  const names = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = normalizeName(entry.name);
    if (names.has(name)) throw new Error(`ZIP 文件名重复：${name}`);
    names.add(name);
    const nameBytes = encoder.encode(name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data,
    ]);
    localParts.push(local);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]));
    offset += local.length;
  }
  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return concat([...localParts, central, end]);
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readStoredZip(bytes: Uint8Array, limits: ZipReadLimits = {}): Map<string, Uint8Array> {
  const maxEntries = limits.maxEntries ?? 20_000;
  const maxEntryBytes = limits.maxEntryBytes ?? 256 * 1024 * 1024;
  const maxTotalBytes = limits.maxTotalBytes ?? 512 * 1024 * 1024;
  if (bytes.length < 22) throw new Error("ZIP 文件不完整");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount < 1 || entryCount > maxEntries) throw new Error("ZIP 文件数量超出限制");
  if (centralOffset + centralSize > eocdOffset) throw new Error("ZIP 中央目录无效");
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let total = 0;
  while (offset < centralOffset) {
    ensureAvailable(bytes, offset, 30);
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("ZIP 本地文件头无效");
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const expectedCrc = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if ((flags & 0x0001) !== 0) throw new Error("不支持加密 ZIP");
    if ((flags & 0x0008) !== 0) throw new Error("不支持数据描述符 ZIP");
    if (method !== 0 || compressedSize !== uncompressedSize) throw new Error("项目包仅支持未压缩 ZIP 条目");
    if (uncompressedSize > maxEntryBytes) throw new Error("ZIP 单个文件超过容量限制");
    const nameOffset = offset + 30;
    const dataOffset = nameOffset + nameLength + extraLength;
    ensureAvailable(bytes, nameOffset, nameLength + extraLength + compressedSize);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(nameOffset, nameOffset + nameLength));
    if (normalizeName(name) !== name) throw new Error("ZIP 文件名不安全");
    if (files.has(name)) throw new Error(`ZIP 文件名重复：${name}`);
    total += uncompressedSize;
    if (total > maxTotalBytes) throw new Error("ZIP 解压后总容量超过限制");
    const data = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP 文件校验失败：${name}`);
    files.set(name, data);
    offset = dataOffset + compressedSize;
  }
  if (offset !== centralOffset || files.size !== entryCount) throw new Error("ZIP 文件数量或目录偏移不一致");
  return files;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  throw new Error("ZIP 缺少中央目录结束记录");
}

function ensureAvailable(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) throw new Error("ZIP 文件不完整");
}

function normalizeName(name: string): string {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("ZIP 文件名不安全");
  return normalized;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
