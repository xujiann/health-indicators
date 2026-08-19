const MARKER = "<!-- subprov-task:";

export function issueTitle(task) {
  return `[数据补录] ${task.priority} ${task.city} ${task.year}`;
}

function issueSources(task) {
  const channels = Array.isArray(task.source_channels) ? task.source_channels : [];
  if (channels.length) {
    return channels.map((source) => `- [${source.agency} · ${source.topic}](${source.url})`).join("\n");
  }
  return task.source_url ? `- ${task.source_url}` : "- 暂无已登记来源";
}

export function issueBody(task) {
  return `${MARKER}${task.id} -->\n\n任务状态：**${task.status}**\n\n缺失指标：\n${task.missing_metrics.map((item) => `- [ ] ${item.compare_key}（${item.unit}）`).join("\n")}\n\n优先来源：\n${issueSources(task)}\n\n> 本 Issue 由 \`npm run tasks:issues:apply\` 同步；任务完成补录并从缺口清单消失后自动关闭。`;
}

export function buildIssuePlan(tasks, issues) {
  const byTask = new Map();
  for (const issue of issues) {
    const match = String(issue.body || "").match(/<!-- subprov-task:([^ ]+) -->/);
    if (match) byTask.set(match[1], issue);
  }
  const currentIds = new Set(tasks.map((task) => task.id));
  const plan = tasks.map((task) => {
    const issue = byTask.get(task.id);
    if (!issue) return { action: task.status === "imported" ? "skip" : "create", task, title: issueTitle(task), body: issueBody(task) };
    if (task.status === "imported" && issue.state !== "CLOSED") return { action: "close", task, issue };
    if (task.status !== "imported" && issue.state === "CLOSED") return { action: "reopen", task, issue, title: issueTitle(task), body: issueBody(task) };
    if (task.status !== "imported" && (issue.title !== issueTitle(task) || issue.body !== issueBody(task))) return { action: "update", task, issue, title: issueTitle(task), body: issueBody(task) };
    return { action: "noop", task, issue };
  });
  for (const [taskId, issue] of byTask) {
    if (!currentIds.has(taskId) && issue.state !== "CLOSED") {
      plan.push({ action: "close", task: { id: taskId, status: "imported" }, issue, reason: "missing_from_current_tasks" });
    }
  }
  return plan;
}
