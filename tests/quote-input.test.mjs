import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scaledInput,
  scaledText,
  quantityInput,
  headcountInput,
} from "../src/client/quote-input.mjs";
test("quote numeric fields preserve decimal cents and milli quantities exactly", () => {
  assert.equal(scaledInput("19.99", 2, "Cost", 1e9), 1999);
  assert.equal(quantityInput("2.125"), 2125);
  assert.equal(scaledInput("7.25", 2, "Discount", 10000), 725);
  assert.equal(scaledInput("100", 2, "Discount", 10000), 10000);
  assert.equal(scaledText(1, 3), "0.001");
  assert.equal(scaledText(1999, 2), "19.99");
  assert.equal(headcountInput("2"), 2);
});
test("quote numeric fields reject blank, truncated, exponential and out-of-range money", () => {
  for (const value of [
    "",
    "1.005",
    "1e2",
    "-1",
    "NaN",
    "Infinity",
    "1,000",
    "10000000.01",
  ])
    assert.throws(() => scaledInput(value, 2, "Cost", 1e9));
  for (const value of ["0", "0.0001", "1000000.001"])
    assert.throws(() => quantityInput(value));
  for (const value of ["", "0", "1.5", "101"])
    assert.throws(() => headcountInput(value));
  assert.throws(() => scaledInput("100.01", 2, "Discount", 10000));
});
