import { FileStore, repoPath, stateDir } from "@midas/db";
import { runMilestoneFinchContinue } from "../packages/eval/src/finch-depth.ts";
const store = new FileStore(stateDir());
const summary = runMilestoneFinchContinue(store, { stateDir: stateDir(), tests: "pending_runner_will_fill", archive: null });
console.log(JSON.stringify(summary, null, 2));
