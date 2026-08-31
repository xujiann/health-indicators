import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeNHCExtractFragment } from "../../scripts/lib/nhc-extract-validation.mjs";

const base = {
  source_url: "https://www.nhc.gov.cn/example.pdf",
  note: "国家卫健委统计公报扩展指标抽取；PDF表格结构化",
};

test("卫健公报校验拦截跨表正文污染", () => {
  assert.equal(looksLikeNHCExtractFragment({
    ...base,
    indicator: "丙类传染病村（居委会）数报告死亡人数",
    compare_key: "丙类传染病村（居委会）数报告死亡人数",
  }), true);
  assert.equal(looksLikeNHCExtractFragment({
    ...base,
    indicator: "位数由床位数",
    compare_key: "位数由床位数",
  }), true);
});

test("卫健公报校验保留合法表格指标", () => {
  assert.equal(looksLikeNHCExtractFragment({
    ...base,
    indicator: "丙类传染病流行性感冒报告发病例数",
    compare_key: "丙类传染病流行性感冒报告发病例数",
  }), false);
  assert.equal(looksLikeNHCExtractFragment({
    ...base,
    indicator: "3岁以下儿童系统管理率",
    compare_key: "3岁以下儿童系统管理率",
  }), false);
});
