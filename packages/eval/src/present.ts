import type { CaseRecord, ProspectMapping, RuntimeInput } from "./types.js";
import { deriveAliasSeed, deriveOrderSeed, fisherYates, prngFromSeed } from "./rng.js";
import { projectRuntimeCase } from "./project.js";
import { formatAjvErrors, validateTaskInputAjv } from "./schemas.js";

const ID_RE = /^P[0-9]{1,2}$/;

function numericId(id: string): number {
  return Number.parseInt(id.slice(1), 10);
}

function makeRuntimeIds(authoringIds: string[], random: () => number): string[] {
  const n = authoringIds.length;
  const authoringNums = new Set(authoringIds.map(numericId));
  const maxStart = 99 - n + 1;
  let chosen: number[] | null = null;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const start = 1 + Math.floor(random() * maxStart);
    const nums = Array.from({ length: n }, (_, i) => start + i);
    if (nums.some((x) => x < 1 || x > 99)) continue;
    const overlap = nums.some((x) => authoringNums.has(x));
    if (!overlap) {
      chosen = nums;
      break;
    }
    if (!chosen) chosen = nums;
  }

  if (!chosen) {
    chosen = Array.from({ length: n }, (_, i) => i + 1);
  }

  const runtimeIds = chosen.map((x) => `P${x}`);
  for (const id of runtimeIds) {
    if (!ID_RE.test(id)) {
      throw new Error(`Generated runtime prospect id ${id} does not match ^P[0-9]{1,2}$`);
    }
  }
  return fisherYates(runtimeIds, random);
}

function buildMapping(authoringIds: string[], aliasSeed: Buffer): Omit<ProspectMapping, "presentationOrderRuntimeIds"> {
  const random = prngFromSeed(aliasSeed);
  const runtimeIds = makeRuntimeIds(authoringIds, random);
  const authoringToRuntime = new Map<string, string>();
  const runtimeToAuthoring = new Map<string, string>();
  for (let i = 0; i < authoringIds.length; i += 1) {
    const a = authoringIds[i]!;
    const r = runtimeIds[i]!;
    authoringToRuntime.set(a, r);
    runtimeToAuthoring.set(r, a);
  }
  return { authoringToRuntime, runtimeToAuthoring };
}

export function presentCase(args: {
  record: CaseRecord;
  evaluatorSecret: string;
  suiteVersion: string;
  trialIndex: number;
}): { runtimeInput: RuntimeInput; mapping: ProspectMapping } {
  const { record, evaluatorSecret, suiteVersion, trialIndex } = args;
  if (!evaluatorSecret) {
    throw new Error("evaluatorSecret is required for presentation randomization");
  }

  const orderSeed = deriveOrderSeed(evaluatorSecret, suiteVersion, record.case_id, trialIndex);
  const aliasSeed = deriveAliasSeed(evaluatorSecret, suiteVersion, record.case_id, trialIndex);

  const authoringIds = record.prospects.map((p) => p.id);
  const idMapping = buildMapping(authoringIds, aliasSeed);

  const projected = projectRuntimeCase(record);
  const orderRandom = prngFromSeed(orderSeed);
  const shuffled = fisherYates(projected.prospects, orderRandom);

  const remappedProspects = shuffled.map((p) => ({
    ...p,
    id: idMapping.authoringToRuntime.get(p.id)!,
    facts: structuredClone(p.facts),
    evidence: p.evidence.map((e) => ({ ...e })),
  }));

  const runtimeInput: RuntimeInput = {
    case_id: projected.case_id,
    title: projected.title,
    offer: projected.offer,
    qualification_policy: projected.qualification_policy,
    constraints: projected.constraints,
    prospects: remappedProspects,
  };

  const ok = validateTaskInputAjv(runtimeInput);
  if (!ok) {
    throw new Error(
      `Presented runtime input failed atlas_task_input.schema.json: ${formatAjvErrors(validateTaskInputAjv.errors).join("; ")}`,
    );
  }

  const serialized = JSON.stringify(runtimeInput);
  for (const leak of ["\"gold\"", "ranked_tiers", "required_unknowns", "required_evidence", "critical_failures"]) {
    if (serialized.includes(leak)) {
      throw new Error(`Presented runtime input leaked evaluator field ${leak}`);
    }
  }

  const mapping: ProspectMapping = {
    ...idMapping,
    presentationOrderRuntimeIds: remappedProspects.map((p) => p.id),
  };

  return { runtimeInput, mapping };
}
