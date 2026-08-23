import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../../..");

export const SUITE_V0_ID = "atlas-dev-v0";
export const SUITE_V01_ID = "atlas-dev-v0.1";
export const SUITE_CHALLENGE_ID = "atlas-challenge-v0";

export const SUITE_V0_VERSION = "atlas-prospect-qualification-starter-v0.1.0";
export const SUITE_V01_VERSION = "atlas-prospect-qualification-starter-v0.1.1";
export const SUITE_CHALLENGE_VERSION = "atlas-prospect-qualification-challenge-v0";

export const DEV_CASES_V0 = join(REPO_ROOT, "evals/atlas/v0/development/atlas_dev_cases_v0.jsonl");
export const DEV_CASES_V01 = join(REPO_ROOT, "evals/atlas/v0/development/atlas_dev_cases_v0.1.jsonl");
export const DEV_CASES_V01_MANIFEST = join(REPO_ROOT, "evals/atlas/v0/development/atlas_dev_cases_v0.1.manifest.json");
export const CHALLENGE_CASES_V0 = join(REPO_ROOT, "evals/atlas/v0/challenge/atlas_challenge_cases_v0.jsonl");
export const CHALLENGE_CASES_V0_MANIFEST = join(REPO_ROOT, "evals/atlas/v0/challenge/atlas_challenge_cases_v0.manifest.json");
export const CHALLENGE_POLICIES_DIR = join(REPO_ROOT, "evals/atlas/v0/challenge/policies");
export const CHALLENGE_FREEZE_ORDER = join(REPO_ROOT, "evals/atlas/v0/challenge/freeze-order.json");
export const MISSION03_EVIDENCE_LOCK = join(REPO_ROOT, "evals/atlas/v0/challenge/mission03-evidence.lock.json");
export const RETRIEVAL_RELEVANCE_V0 = join(REPO_ROOT, "evals/atlas/v0/challenge/retrieval_relevance_v0.json");
export const RETRIEVAL_RELEVANCE_V0_MANIFEST = join(REPO_ROOT, "evals/atlas/v0/challenge/retrieval_relevance_v0.manifest.json");
export const APPLICABILITY_MICRO_V0 = join(REPO_ROOT, "evals/atlas/v0/applicability/atlas_applicability_v0.jsonl");
export const APPLICABILITY_MICRO_V0_MANIFEST = join(REPO_ROOT, "evals/atlas/v0/applicability/atlas_applicability_v0.manifest.json");
export const APPLICABILITY_MICRO_LOCK = join(REPO_ROOT, "evals/atlas/v0/applicability/mission05-applicability.lock.json");

export const FROZEN_V0_JSONL_SHA256 = "2092f8da53aa8d5b804fc45f10992e1b16c56a1b1d7f062e3c97f3f7e6284887";
export const FROZEN_ATLAS_V0 = "643453dd2ff025bba3c43be50f3eca4161f3b387248b56d051dcdeb4738d6bf9";
export const FROZEN_ATLAS_V1 = "f1c616a00433730b28cab07bc9c6e7bfa492001c6a836a2e1ccf07f9b1507d07";
export const FROZEN_ATLAS_V2 = "9db7ad586dcbab350d4509b7da30e34b907ded42a77c1a1ede990b4ebd914428";
export const FROZEN_ATLAS_V3 = "add429661da957d0d1d7726a9a4de201ed5621a33077f890a505d1938971c7a8";
export const FROZEN_ATLAS_V4 = "96252f0cae8ba28934e8b5facd18d4af1fa25354d04a95952b38827d7e1e26d8";
export const FROZEN_ATLAS_V5 = "2381fe40057970c7682dc2fa3967ff0459f6d2b82923634de4a07da8177b2290";
export const FROZEN_OWNER_SNAPSHOT = "edc222091f5c1937e89748e3e72d037551021fbc51a9a1760b2e7138a580aa5e";
export const FROZEN_CHALLENGE_JSONL = "1e96764dd2f4418b20fdc93a32cb7f26e0fc52059f269385f8be71e69695710d";

export function defaultDevCasesPath() {
  if (process.env.MIDAS_CASES_PATH && existsSync(process.env.MIDAS_CASES_PATH)) {
    return process.env.MIDAS_CASES_PATH;
  }
  if (existsSync(DEV_CASES_V01)) return DEV_CASES_V01;
  return DEV_CASES_V0;
}

export function resolveSuite(spec) {
  const key = String(spec || "v0.1").toLowerCase();
  if (key === "v0" || key === "historical" || key === SUITE_V0_ID || key === SUITE_V0_VERSION) {
    return { suiteId: SUITE_V0_ID, suiteVersion: SUITE_V0_VERSION, casesPath: DEV_CASES_V0, historical: true };
  }
  if (key === "challenge" || key === "challenge-v0" || key === SUITE_CHALLENGE_ID || key === SUITE_CHALLENGE_VERSION) {
    return { suiteId: SUITE_CHALLENGE_ID, suiteVersion: SUITE_CHALLENGE_VERSION, casesPath: CHALLENGE_CASES_V0, historical: false };
  }
  return { suiteId: SUITE_V01_ID, suiteVersion: SUITE_V01_VERSION, casesPath: DEV_CASES_V01, historical: false };
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
