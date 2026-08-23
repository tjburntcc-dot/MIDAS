import { FileStore } from "@midas/db";
import { runMilestoneFinchContinue } from "/workspace/midas/packages/eval/src/finch-depth.ts";
const store = new FileStore("/workspace/midas/var/state");
const summary = runMilestoneFinchContinue(store, { stateDir: "/workspace/midas/var/state", tests: "pending_runner_will_fill", archive: null });
console.log(JSON.stringify(summary, null, 2));
