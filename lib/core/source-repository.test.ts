import assert from "node:assert/strict";
import test from "node:test";
import { importTextDocument } from "./importer.ts";
import { MemorySourceRepository } from "./source-repository.ts";

test("source repository isolates projects and replaces a repeated immutable source", async () => {
  const repository = new MemorySourceRepository();
  const sourceA = await importTextDocument({ projectId: "a", fileName: "a.txt", bytes: new TextEncoder().encode("第一章\n内容 A") });
  const sourceB = await importTextDocument({ projectId: "b", fileName: "b.txt", bytes: new TextEncoder().encode("第一章\n内容 B") });

  await repository.save(sourceA);
  await repository.save(sourceB);
  await repository.save(sourceA);

  assert.equal((await repository.listByProject("a")).length, 1);
  assert.equal((await repository.listByProject("a"))[0].document.originalText, "第一章\n内容 A");
  assert.equal((await repository.listByProject("b")).length, 1);

  await repository.remove(sourceA.document.id);
  assert.equal((await repository.listByProject("a")).length, 0);
  assert.equal((await repository.listByProject("b")).length, 1);
});

