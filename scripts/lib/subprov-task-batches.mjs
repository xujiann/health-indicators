const VALID_STATUSES = new Set(["pending", "found", "reviewed", "imported"]);

export function makeTaskId(regionCode, year) {
  return `${regionCode}-${year}`;
}

export function buildTaskBatches(gaps, statusPayload = { tasks: {} }, sourceRegistry = []) {
  const sourcesByCode = sourceRegistry.reduce((map, source) => {
    const list = map.get(source.region_code) || [];
    list.push(source);
    map.set(source.region_code, list);
    return map;
  }, new Map());
  const groups = new Map();
  for (const gap of gaps) {
    const id = makeTaskId(gap.region_code, gap.year);
    const task = groups.get(id) || {
      id,
      city: gap.city,
      region_code: gap.region_code,
      year: gap.year,
      status: "pending",
      priority: gap.year >= 2023 ? "P0" : gap.year === 2022 ? "P1" : "P2",
      missing_metrics: [],
      expected_impact: 0,
      recommended_document: `${gap.year}年${gap.city}国民经济和社会发展统计公报`,
      source_channels: sourcesByCode.get(gap.region_code) || [],
    };
    task.missing_metrics.push({
      metric_key: gap.metric_key,
      compare_key: gap.compare_key,
      unit: gap.unit,
    });
    task.expected_impact += 1;
    groups.set(id, task);
  }
  for (const task of groups.values()) {
    const saved = statusPayload.tasks?.[task.id];
    if (saved) {
      task.status = VALID_STATUSES.has(saved.status) ? saved.status : "pending";
      if (saved.assignee) task.assignee = saved.assignee;
      if (saved.note) task.note = saved.note;
      if (saved.updated_at) task.updated_at = saved.updated_at;
    }
  }
  return [...groups.values()].sort((a, b) => (
    a.priority.localeCompare(b.priority)
    || Number(b.year) - Number(a.year)
    || a.city.localeCompare(b.city, "zh-Hans")
  ));
}

export function validateTaskStatuses(statusPayload, batches) {
  const errors = [];
  const known = new Set(batches.map((task) => task.id));
  if (statusPayload.schema_version !== 1 || typeof statusPayload.tasks !== "object" || !statusPayload.tasks) {
    return ["任务状态文件必须使用 schema_version=1 且包含 tasks 对象"];
  }
  for (const [id, entry] of Object.entries(statusPayload.tasks)) {
    if (!known.has(id) && entry.status !== "imported") errors.push(`任务状态 ${id} 不对应当前缺口批次`);
    if (!VALID_STATUSES.has(entry.status)) errors.push(`任务状态 ${id} 的 status 无效`);
  }
  return errors;
}

export function summarizeBatchImpact(acceptedRows, batches) {
  const accepted = new Set(acceptedRows.map((row) => `${row.region_code}-${row.year}`));
  return batches
    .filter((batch) => accepted.has(batch.id))
    .map((batch) => ({
      id: batch.id,
      city: batch.city,
      year: batch.year,
      current_missing: batch.expected_impact,
      accepted_rows: acceptedRows.filter((row) => `${row.region_code}-${row.year}` === batch.id).length,
    }));
}
