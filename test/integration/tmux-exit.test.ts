import { it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { isTmuxAvailable, pollForExit, readScreen, readScreenAsync } from "../../pi-extension/subagents/tmux.ts";

it("detects a soft-wrapped exit marker in a 15-column pane", {
  skip: !isTmuxAvailable(),
  timeout: 10_000,
}, async () => {
  const session = `pi-exit-test-${process.pid}`;
  const pane = execFileSync("tmux", [
    "new-session", "-d", "-s", session, "-x", "15", "-y", "24", "-P", "-F", "#{pane_id}",
    `tmux wait-for ${session}; printf '__SUBAGENT_DONE_0__\\nNEXT_LINE\\n'; sleep 30`,
  ], { encoding: "utf8" }).trim();
  try {
    execFileSync("tmux", ["resize-window", "-t", pane, "-x", "15", "-y", "24"]);
    execFileSync("tmux", ["wait-for", "-S", session]);
    let raw = "";
    for (let attempt = 0; attempt < 50; attempt++) {
      raw = execFileSync("tmux", ["capture-pane", "-p", "-t", pane], { encoding: "utf8" });
      if (raw.includes("NEXT_LINE")) break;
      await setTimeout(50);
    }
    assert.doesNotMatch(raw, /__SUBAGENT_DONE_0__/);
    assert.ok(raw.replace(/\n/g, "").startsWith("__SUBAGENT_DONE_0__NEXT_LINE"));
    for (const screen of [readScreen(pane), await readScreenAsync(pane)]) {
      assert.match(screen, /__SUBAGENT_DONE_0__\nNEXT_LINE/);
    }
    assert.deepEqual(await pollForExit(pane, AbortSignal.timeout(2000), { interval: 50 }), {
      reason: "sentinel", exitCode: 0,
    });
  } finally {
    execFileSync("tmux", ["kill-session", "-t", session]);
  }
});
