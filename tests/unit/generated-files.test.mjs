import assert from "node:assert/strict";
import test from "node:test";

import { sameGeneratedText } from "../../scripts/lib/generated-files.mjs";

test("生成文件比较忽略平台换行符差异", () => {
  assert.equal(sameGeneratedText("第一行\n第二行\n", "第一行\r\n第二行\r\n"), true);
  assert.equal(sameGeneratedText("第一行\n第二行\n", "第一行\n内容变化\n"), false);
});
