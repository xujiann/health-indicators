import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

async function snapshot(paths) {
  return Promise.all(paths.map(async (filePath) => {
    try {
      return { filePath, exists: true, content: await fs.readFile(filePath) };
    } catch (error) {
      if (error.code === "ENOENT") return { filePath, exists: false, content: null };
      throw error;
    }
  }));
}

async function restore(entries) {
  await Promise.all(entries.map(async (entry) => {
    if (entry.exists) {
      await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
      await fs.writeFile(entry.filePath, entry.content);
    } else {
      await fs.rm(entry.filePath, { force: true });
    }
  }));
}

export function runNpm(repoRoot, args, options = {}) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture ? `${result.stdout || ""}\n${result.stderr || ""}`.trim() : "";
    throw new Error(`npm ${args.join(" ")} 失败（退出码 ${result.status}）${details ? `\n${details}` : ""}`);
  }
  return result;
}

export async function applyFileTransaction({
  repoRoot,
  destination,
  content,
  writes,
  generatedPaths = [],
  verify = [["run", "build:data"], ["test"]],
}) {
  const fileWrites = writes || [{ filePath: destination, content }];
  if (!fileWrites.length || fileWrites.some((entry) => !entry.filePath)) {
    throw new Error("事务至少需要一个有效写入目标");
  }
  const tracked = [...new Set([...fileWrites.map((entry) => entry.filePath), ...generatedPaths])];
  const before = await snapshot(tracked);
  try {
    for (const entry of fileWrites) {
      await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
      await fs.writeFile(entry.filePath, entry.content, "utf8");
    }
    for (const args of verify) runNpm(repoRoot, args);
    return { applied: true, rolled_back: false };
  } catch (error) {
    await restore(before);
    throw new Error(`事务应用失败，已回滚全部目标和生成文件：${error.message}`, { cause: error });
  }
}
