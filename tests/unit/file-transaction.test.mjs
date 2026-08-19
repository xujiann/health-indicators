import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyFileTransaction } from "../../scripts/lib/file-transaction.mjs";

test("事务验证失败时恢复目标文件", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "health-data-transaction-"));
  const destination = path.join(root, "payload.json");
  await fs.writeFile(destination, "before\n");
  await assert.rejects(
    applyFileTransaction({
      repoRoot: root,
      destination,
      content: "after\n",
      verify: [["--definitely-not-an-npm-command"]],
    }),
    /已回滚/,
  );
  assert.equal(await fs.readFile(destination, "utf8"), "before\n");
  await fs.rm(root, { recursive: true, force: true });
});

test("多文件事务失败时同时恢复所有目标", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "health-data-multi-transaction-"));
  const first = path.join(root, "first.json");
  const second = path.join(root, "second.json");
  await fs.writeFile(first, "first-before\n");
  await fs.writeFile(second, "second-before\n");
  await assert.rejects(
    applyFileTransaction({
      repoRoot: root,
      writes: [
        { filePath: first, content: "first-after\n" },
        { filePath: second, content: "second-after\n" },
      ],
      verify: [["--definitely-not-an-npm-command"]],
    }),
    /已回滚/,
  );
  assert.equal(await fs.readFile(first, "utf8"), "first-before\n");
  assert.equal(await fs.readFile(second, "utf8"), "second-before\n");
  await fs.rm(root, { recursive: true, force: true });
});
