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
