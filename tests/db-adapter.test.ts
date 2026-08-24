import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaggedQuery } from "../src/lib/db.ts";

describe("buildTaggedQuery", () => {
  it("把标签模板转成 $N 占位 + params", () => {
    const id = "abc";
    const { text, params } = buildTaggedQuery`select * from docs where id = ${id}`;
    assert.equal(text, "select * from docs where id = $1");
    assert.deepEqual(params, ["abc"]);
  });

  it("保留贴在占位符后的 ::jsonb cast", () => {
    const tags = ["a", "b"];
    const { text, params } = buildTaggedQuery`insert into docs (tags) values (${JSON.stringify(tags)}::jsonb)`;
    assert.equal(text, "insert into docs (tags) values ($1::jsonb)");
    assert.deepEqual(params, ['["a","b"]']);
  });

  it("多个占位符顺序编号", () => {
    const { text, params } = buildTaggedQuery`a=${1} b=${2} c=${3}`;
    assert.equal(text, "a=$1 b=$2 c=$3");
    assert.deepEqual(params, [1, 2, 3]);
  });

  it("无占位符时原样返回空 params", () => {
    const { text, params } = buildTaggedQuery`select now()`;
    assert.equal(text, "select now()");
    assert.deepEqual(params, []);
  });
});
