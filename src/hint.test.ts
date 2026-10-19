import assert from "node:assert/strict";
import { test } from "node:test";
import { hintAnchor } from "./tooltip.ts";

test("a tooltip floats above a button, or below one that is against the top", () => {
  const below = hintAnchor({ top: 12, bottom: 40, left: 100, width: 28 });
  assert.equal(below.place, "below");
  assert.equal(below.y, 48);
  assert.equal(below.x, 114);

  const above = hintAnchor({ top: 200, bottom: 228, left: 120, width: 28 });
  assert.equal(above.place, "above");
  assert.equal(above.y, 192);
  assert.equal(above.x, 134);

  const rail = hintAnchor({ top: 10, bottom: 42, left: 4, width: 32 });
  assert.equal(rail.place, "right");
  assert.equal(rail.x, 44);
  assert.equal(rail.y, 26);
});
