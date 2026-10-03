import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAiTaskRepository, transitionAiTask } from "./ai-task.ts";

const input = {
  id: "task-1",
  projectId: "project-1",
  kind: "synopsis.generate",
  idempotencyKey: "idem-1",
  inputHash: "hash-1",
  providerId: "provider-1",
  model: "writer",
  now: "2026-09-28T00:00:00.000Z",
};

test("creates idempotent tasks within a project", async () => {
  const repository = new MemoryAiTaskRepository();
  const first = await repository.create(input);
  const duplicate = await repository.create({ ...input, id: "task-2" });
  const otherProject = await repository.create({ ...input, id: "task-3", projectId: "project-2" });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.task.id, "task-1");
  assert.equal(otherProject.created, true);
});

test("enforces legal state transitions and failure evidence", () => {
  const task = {
    ...input,
    status: "queued" as const,
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const running = transitionAiTask(task, "running", { now: "2026-09-28T00:01:00.000Z" });
  const failed = transitionAiTask(running, "failed", { now: "2026-09-28T00:02:00.000Z", error: { code: "TIMEOUT", message: "超时", retryable: true } });
  const retried = transitionAiTask(failed, "queued", { now: "2026-09-28T00:03:00.000Z" });

  assert.equal(running.startedAt, "2026-09-28T00:01:00.000Z");
  assert.equal(failed.finishedAt, "2026-09-28T00:02:00.000Z");
  assert.equal(retried.error, undefined);
  assert.throws(() => transitionAiTask(task, "succeeded"), /非法/);
  assert.throws(() => transitionAiTask(running, "failed"), /错误信息/);
});

test("uses optimistic revisions to prevent lost updates", async () => {
  const repository = new MemoryAiTaskRepository();
  const { task } = await repository.create(input);
  const running = transitionAiTask(task, "running");
  await repository.save(running, 0);

  const paused = transitionAiTask(running, "paused");
  await assert.rejects(repository.save(paused, 0), /版本冲突/);
  assert.equal((await repository.get(task.id))?.status, "running");
});

