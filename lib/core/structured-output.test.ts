import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonObject, requireStringFields } from "./structured-output.ts";

test("parses a plain or fenced JSON object", () => {
  assert.deepEqual(parseJsonObject('{"title":"候选"}'), { title: "候选" });
  assert.deepEqual(parseJsonObject('```json\n{"title":"候选"}\n```'), { title: "候选" });
});

test("rejects invalid JSON and arrays", () => {
  assert.throws(() => parseJsonObject("not json"), /有效的结构化 JSON/);
  assert.throws(() => parseJsonObject("[]"), /不是对象/);
});

test("validates required string fields", () => {
  const candidate = { logline: "一句话", summary: "梗概" };
  assert.equal(requireStringFields(candidate, ["logline", "summary"]), candidate);
  assert.throws(() => requireStringFields({ logline: 1 }, ["logline"]), /缺少文本字段/);
});

