/**
 * Phase 5 — pure unit test for the 3000 ms polling switch.
 *
 * This is a pure function test (node:test). It does not touch the
 * DOM, React, or Supabase — it only verifies shouldPoll() and
 * POLL_INTERVAL_MS from lib/thread.ts.
 *
 * Run with:  node --test lib/thread.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPoll, POLL_INTERVAL_MS } from "./thread.ts";

test("POLL_INTERVAL_MS is exactly 3000", () => {
  assert.equal(POLL_INTERVAL_MS, 3000);
});

test("shouldPoll returns false when channel is joined", () => {
  assert.equal(shouldPoll("joined"), false);
});

test("shouldPoll returns true for non-joined statuses (polling fallback)", () => {
  const notJoined = ["connecting", "closed", "closing", "timed out", ""];
  for (const status of notJoined) {
    assert.equal(shouldPoll(status), true, `status="${status}" should poll`);
  }
});

test("shouldPoll is case-sensitive — only lowercase 'joined' stops polling", () => {
  assert.equal(shouldPoll("Joined"), true);
  assert.equal(shouldPoll("JOINED"), true);
});

test("shouldPoll with undefined-ish values polls", () => {
  assert.equal(shouldPoll(""), true);
});
