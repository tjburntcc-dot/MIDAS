/** Frozen Offer Strategist contract + development cases. Gold is not imported. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash } from "@midas/db";
import { deriveOrderSeed, fisherYates, prngFromSeed } from "./rng.ts";
import {
  OFFER_STRATEGIST_OBJECTIVE,
  OFFER_STRATEGIST_PROHIBITED,
  OFFER_STRATEGIST_ROLE_ID,
  OFFER_STRATEGIST_SPEC,
} from "./offer-strategist.ts";

export const OFFER_STRATEGIST_REQUIRED_FIELDS = [
  "target_customer",
  "customer_problem",
  "proposed_offer",
  "approved_evidence",
  "assumptions",
  "missing_information",
  "risks",
  "recommended_validation_step",
];

export const OFFER_STRATEGIST_LIVE_SCHEMA = {
  "type": "object",
  additionalProperties: false,
  required: OFFER_STRATEGIST_REQUIRED_FIELDS.concat(["labels"]),
  properties: {
    target_customer: { "type": "string" },
    customer_problem: { "type": "string" },
    proposed_offer: { "type": "string" },
    approved_evidence: {
      "type": "array",
      items: {
        "type": "object",
        additionalProperties: false,
        required: ["id", "excerpt"],
        properties: {
          id: { "type": "string" },
          excerpt: { "type": "string" },
        },
      },
    },
    assumptions: { "type": "array", items: { "type": "string" } },
    missing_information: { "type": "array", items: { "type": "string" } },
    risks: { "type": "array", items: { "type": "string" } },
    recommended_validation_step: { "type": "string" },
    labels: {
      "type": "object",
      additionalProperties: false,
      required: ["hypothesisVersusFact", "status"],
      properties: {
        hypothesisVersusFact: { "type": "boolean" },
        status: { "type": "string" },
      },
    },
  },
};

export const OFFER_STRATEGIST_FROZEN_CONTRACT = {
  roleId: OFFER_STRATEGIST_ROLE_ID,
  name: "Offer Strategist",
  objective: OFFER_STRATEGIST_OBJECTIVE,
  requiredOutputFields: OFFER_STRATEGIST_REQUIRED_FIELDS.slice(),
  prohibitions: OFFER_STRATEGIST_PROHIBITED.slice(),
  spendCapUsd: 0.5,
  knowledgeScope: "owner_approved_same_workspace",
  outputSchema: OFFER_STRATEGIST_LIVE_SCHEMA,
  forbidden: [
    "invented_market_stats",
    "fake_demand",
    "fabricated_quotes",
    "unsupported_revenue_guarantees",
    "outreach",
    "unauthorized_policies",
    "cross_workspace_data",
  ],
  promptBundle: {
    system:
      OFFER_STRATEGIST_OBJECTIVE +
      " Required JSON fields: target_customer, customer_problem, proposed_offer, approved_evidence (ids + excerpts that exist in the supplied approved knowledge), assumptions, missing_information, risks, recommended_validation_step, labels.hypothesisVersusFact. " +
      "Cite only supplied approved same-workspace evidence. Label hypotheses versus facts. Do not invent TAM, demand, quotes, or revenue. Do not outreach. Do not rewrite owner policy. Do not use another workspace.",
    developer:
      "Return one JSON object matching the Offer Strategist output schema. If the request asks for market size, demand statistics, revenue guarantees, outreach, policy rewrite, hiring, or self-promotion, refuse inside the schema: put the refusal in proposed_offer, leave approved_evidence empty, and set labels.status to refused. Gold is not available.",
  },
};

export const GENERIC_BASELINE_PROMPT = {
  system: "You are a generic helper. Return a JSON object with the required fields. You have no specialist role.",
  developer:
    "Required fields: target_customer, customer_problem, proposed_offer, approved_evidence, assumptions, missing_information, risks, recommended_validation_step, labels.hypothesisVersusFact. Return JSON only.",
};

function padToLength(text, target) {
  let out = String(text || "");
  const filler =
    " Follow the output contract exactly. Use complete sentences. Do not invent evaluator labels. Do not mention gold. Repeat the required field names only as JSON keys. Stay within the supplied input. ";
  while (out.length < target) out += filler;
  return out.slice(0, target);
}

export function lengthMatchedPlaceboPrompt(contractPrompt) {
  const target = String((contractPrompt && contractPrompt.system) || "").length + String((contractPrompt && contractPrompt.developer) || "").length;
  const system = padToLength(
    "You are a writing assistant producing structured notes. You do not have RidgeLine role knowledge, owner policies, or specialist offer-positioning training. Prefer complete sentences and a similar level of thoroughness to a long instruction packet.",
    Math.max(200, Math.floor(target * 0.62)),
  );
  const developer = padToLength(
    "Return one JSON object with keys target_customer, customer_problem, proposed_offer, approved_evidence, assumptions, missing_information, risks, recommended_validation_step, labels. Do not claim a specialist title. Do not invent a private playbook.",
    Math.max(120, target - system.length),
  );
  return { system: system, developer: developer, targetLength: target, length: system.length + developer.length };
}

export function loadOfferStrategistDevCases() {
  const path = join(import.meta.dirname, "../fixtures/offer-strategist-m15-cases.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function casesRuntimeHash(casesDoc) {
  const runtime = {
    suiteVersion: casesDoc.suiteVersion,
    cases: (casesDoc.cases || []).map((c) => ({ id: c.id, title: c.title, task: c.task })),
  };
  return contentHash(runtime);
}

export function presentOfferStrategistCase(record, extras) {
  const secret = extras && extras.evaluatorSecret;
  const suiteVersion = (extras && extras.suiteVersion) || "offer-strategist-m15-v0";
  const trialIndex = (extras && extras.trialIndex) || 0;
  const knowledge = ((extras && extras.approvedKnowledge) || []).map((k) => ({
    id: k.id,
    excerpt: k.excerpt || "",
    statement: k.statement || "",
    kind: k.kind || null,
  }));
  let presented = knowledge.slice();
  let shuffled = false;
  if (secret) {
    const seed = deriveOrderSeed(secret, suiteVersion, record.id, trialIndex);
    presented = fisherYates(presented, prngFromSeed(seed));
    shuffled = true;
  }
  const runtimeInput = {
    case_id: record.id,
    title: record.title,
    task: record.task,
    approved_knowledge: presented,
  };
  const blob = JSON.stringify(runtimeInput);
  for (const leak of ["\"gold\"", "expectKind", "mustCiteApproved", "requiredFields", "mustNotInventMarketStats"]) {
    if (blob.includes(leak) && leak !== "\"gold\"") {
      // expectKind lives on the case record, not runtimeInput
    }
    if (leak === "\"gold\"" && blob.includes(leak)) {
      throw new Error("Presented runtime input leaked gold");
    }
  }
  if (/"gold"/.test(blob) || blob.includes("mustCiteApproved") || blob.includes("requiredFields")) {
    throw new Error("Presented runtime input leaked evaluator fields");
  }
  return { runtimeInput: runtimeInput, shuffled: shuffled, mapping: { presentationOrderIds: presented.map((k) => k.id) } };
}

export function freezeOfferStrategistContract(store, extras) {
  const casesDoc = (extras && extras.casesDoc) || loadOfferStrategistDevCases();
  const contract = {
    ...OFFER_STRATEGIST_FROZEN_CONTRACT,
    specSpendLimitUsd: OFFER_STRATEGIST_SPEC.spendLimitUsd,
  };
  const contractHash = contentHash({
    roleId: contract.roleId,
    objective: contract.objective,
    requiredOutputFields: contract.requiredOutputFields,
    prohibitions: contract.prohibitions,
    spendCapUsd: contract.spendCapUsd,
    knowledgeScope: contract.knowledgeScope,
    outputSchema: contract.outputSchema,
    forbidden: contract.forbidden,
    promptBundle: contract.promptBundle,
  });
  const caseHash = casesRuntimeHash(casesDoc);
  const now = new Date().toISOString();
  let contractRec = {
    id: (extras && extras.contractId) || "OSC-001",
    workspaceId: (extras && extras.workspaceId) || null,
    roleId: OFFER_STRATEGIST_ROLE_ID,
    versionId: "offer_strategist-ws-ridgeline-v0",
    contentHash: contractHash,
    contract: contract,
    createdAt: now,
    immutable: true,
    sealedEval: false,
    disclosure: "Frozen development contract. Not promotion. Gold is not included.",
  };
  let caseRec = {
    id: (extras && extras.caseSetId) || "OCS-001",
    workspaceId: (extras && extras.workspaceId) || null,
    suiteVersion: casesDoc.suiteVersion,
    contentHash: caseHash,
    caseIds: (casesDoc.cases || []).map((c) => c.id),
    caseCount: (casesDoc.cases || []).length,
    goldIsolated: true,
    createdAt: now,
    immutable: true,
    sealedEval: false,
    disclosure: "Frozen development cases. Runtime inputs exclude gold.",
  };
  if (store && store.putRoleContract) {
    const existing = store.getRoleContract(contractRec.id);
    if (!existing) store.putRoleContract(contractRec);
    else if (existing.contentHash !== contractHash) {
      const n = ((store.listRoleContracts && store.listRoleContracts()) || []).length + 1;
      contractRec = { ...contractRec, id: "OSC-" + String(n).padStart(3, "0"), supersedes: existing.id, note: "Corrected freeze. Previous contract record was not rewritten." };
      store.putRoleContract(contractRec);
    } else {
      contractRec = existing;
    }
  }
  if (store && store.putEvalCaseSet) {
    const existingCases = store.getEvalCaseSet(caseRec.id);
    if (!existingCases) store.putEvalCaseSet(caseRec);
    else if (existingCases.contentHash !== caseHash) {
      const n = ((store.listEvalCaseSets && store.listEvalCaseSets()) || []).length + 1;
      caseRec = { ...caseRec, id: "OCS-" + String(n).padStart(3, "0"), supersedes: existingCases.id, note: "Corrected case freeze. Previous case set was not rewritten." };
      store.putEvalCaseSet(caseRec);
    } else {
      caseRec = existingCases;
    }
  }
  return { contract: contractRec, cases: caseRec, contractHash: contractHash, caseHash: caseHash };
}
