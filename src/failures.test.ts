import assert from "node:assert/strict";
import { test } from "node:test";
import { onFailure, reportFailure, takePendingFailures } from "./failures.ts";

test("a failure stays visible until something is listening", () => {
  takePendingFailures();
  reportFailure(new Error("quota"), "Could not save this preference.");
  assert.deepEqual(takePendingFailures(), ["quota"]);
  const seen: string[] = [];
  const stop = onFailure((message) => {
    seen.push(message);
  });
  reportFailure("blocked", "Could not save this preference.");
  stop();
  reportFailure(new Error("later"), "Could not save this preference.");
  assert.deepEqual(seen, ["blocked"]);
  assert.deepEqual(takePendingFailures(), ["later"]);
});
