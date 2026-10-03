import assert from "node:assert/strict";
import test from "node:test";
import { diffText } from "./text-diff.ts";

test("produces stable line additions and removals", () => {
  assert.deepEqual(diffText("甲\n乙", "甲\n丙\n乙"), [
    { kind: "same", text: "甲" },
    { kind: "added", text: "丙" },
    { kind: "same", text: "乙" },
  ]);
  assert.deepEqual(diffText("甲\n乙", "甲"), [
    { kind: "same", text: "甲" },
    { kind: "removed", text: "乙" },
  ]);
});
