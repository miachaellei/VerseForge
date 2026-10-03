import assert from "node:assert/strict";
import test from "node:test";
import { crc32, createStoredZip, readStoredZip } from "./zip.ts";

test("creates a deterministic stored ZIP with central directory", () => {
  const first = createStoredZip([{ name: "manifest.json", data: "{}" }, { name: "text/第一章.txt", data: "正文" }]);
  const second = createStoredZip([{ name: "manifest.json", data: "{}" }, { name: "text/第一章.txt", data: "正文" }]);
  assert.deepEqual(first, second);
  assert.equal(new DataView(first.buffer, first.byteOffset).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(first.buffer, first.byteOffset + first.length - 22).getUint32(0, true), 0x06054b50);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const files = readStoredZip(first);
  assert.equal(new TextDecoder().decode(files.get("manifest.json")), "{}");
  assert.equal(new TextDecoder().decode(files.get("text/第一章.txt")), "正文");
});

test("rejects corrupted data and extraction bombs", () => {
  const archive = createStoredZip([{ name: "manifest.json", data: "{}" }]);
  const corrupted = archive.slice();
  corrupted[43] ^= 0xff;
  assert.throws(() => readStoredZip(corrupted), /校验失败/);
  assert.throws(() => readStoredZip(archive, { maxTotalBytes: 1 }), /总容量/);
});

test("rejects unsafe and duplicate paths", () => {
  assert.throws(() => createStoredZip([{ name: "../secret", data: "" }]), /不安全/);
  assert.throws(() => createStoredZip([{ name: "a.txt", data: "" }, { name: "a.txt", data: "" }]), /重复/);
});
