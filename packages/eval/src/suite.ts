import type { AgentResponder, SuiteResult } from "./types.js";
import { loadDevelopmentCases } from "./load.js";
import { presentCase } from "./present.js";
import { translateResponse } from "./translate.js";
import { validateOutput } from "./validate.js";
import { scoreCase } from "./score.js";

export async function runDevelopmentSuite(args: {
  casesPath: string;
  evaluatorSecret: string;
  suiteVersion: string;
  trialIndex: number;
  respond: AgentResponder;
}): Promise<SuiteResult> {
  const { casesPath, evaluatorSecret, suiteVersion, trialIndex, respond } = args;
  const cases = loadDevelopmentCases(casesPath);
  const results = [];

  for (const record of cases) {
    const { runtimeInput, mapping } = presentCase({
      record,
      evaluatorSecret,
      suiteVersion,
      trialIndex,
    });
    const runtimeOutput = await respond(runtimeInput);
    const validation = validateOutput(runtimeOutput);
    const authoringOutput = validation.ok ? translateResponse(runtimeOutput, mapping) : runtimeOutput;
    const score = scoreCase({
      record,
      authoringOutput,
      runtimeInputUsed: runtimeInput,
    });
    results.push({ case_id: record.case_id, validation, score });
  }

  return { suiteVersion, trialIndex, results };
}
