import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff } from "../src/client/builder-diff.ts";

test("builder diff reconstructs both versions and preserves unchanged lines", () => {
  const cases = [
    ["", ""],
    ["one\ntwo\n", "one\nthree\n"],
    ["alpha\nbeta", "alpha\nnew\nbeta"],
    ["a\nb\na\nc", "a\na\nc"],
    ["old", "new"],
    [
      new Array(800).fill("old").join("\n"),
      new Array(800).fill("new").join("\n"),
    ],
  ];
  for (const [before, after] of cases) {
    const diff = lineDiff(before, after);
    assert.equal(
      diff
        .filter((line) => line.kind !== "add")
        .map((line) => line.text)
        .join("\n"),
      before,
    );
    assert.equal(
      diff
        .filter((line) => line.kind !== "remove")
        .map((line) => line.text)
        .join("\n"),
      after,
    );
    assert.deepEqual(
      diff
        .filter((line) => line.oldLine !== undefined)
        .map((line) => line.oldLine),
      before.split("\n").map((_, i) => i + 1),
    );
    assert.deepEqual(
      diff
        .filter((line) => line.newLine !== undefined)
        .map((line) => line.newLine),
      after.split("\n").map((_, i) => i + 1),
    );
  }
  const diff = lineDiff("a\nb\nc", "a\nnew\nc");
  assert.equal(diff.filter((line) => line.kind === "same").length, 2);
});
