import { expect, test } from "bun:test";
import { parseMouseReport } from "../src/mouse";
test("recognizes wheel direction and modifiers in SGR mouse reports", () => {
  expect(parseMouseReport("\u001b[<64;80;12M")).toEqual({
    x: 80,
    y: 12,
    wheel: -1,
  });
  expect(parseMouseReport("[<65;10;24M")).toEqual({ x: 10, y: 24, wheel: 1 });
  expect(parseMouseReport("[<81;10;24M")?.wheel).toBe(1);
  expect(parseMouseReport("[<65;10;24m")?.wheel).toBe(0);
  expect(parseMouseReport("[<66;10;24M")?.wheel).toBe(0);
  expect(parseMouseReport("Rust")).toBeUndefined();
});
