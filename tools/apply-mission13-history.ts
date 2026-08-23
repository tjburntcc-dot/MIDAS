import { createStore } from "../packages/db/src/file-store.ts";
import { applyMission13History } from "../packages/eval/src/mission13-history.ts";

const FROZEN = {
  "atlas-v14": "91340b42e9cc084356cf3fe870d78aa3b8e9be60bc3efbe5e89348f8f68ff4fc",
  "atlas-v15": "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70",
  "atlas-v16": "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1",
  "scout-ws-ridgeline-v0": "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5",
  "watcher-ws-ridgeline-v0": "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061",
  "conductor-ws-ridgeline-v0": "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102",
};

const store = createStore(process.env.MIDAS_STATE_DIR || "/workspace/midas/var/state");
function checkHashes(label) {
  const bad = [];
  for (const [id, hash] of Object.entries(FROZEN)) {
    const v = store.getVersion(id);
    if (!v) { bad.push(id + " missing"); continue; }
    if (v.contentHash !== hash) bad.push(id + " changed");
  }
  if (bad.length) throw new Error(label + ": " + bad.join(", "));
}
checkHashes("before");
const fnd = store.getScoutFinding("FND-013");
const src = store.getSource("SRC-STUDIO-URL-004");
const v16 = store.getVersion("atlas-v16");
const events = store.listContributionEvents() || [];
const ce = events.filter((e) => e.kind === "supported_finding_proposed" && e.evidence && e.evidence.findingId === "FND-013");
const out = applyMission13History(store);
checkHashes("after");
const ws = store.getWorkspace("ws-ridgeline");
console.log(JSON.stringify({
  ok: true,
  fnd013Preserved: Boolean(fnd) && store.getScoutFinding("FND-013").id === "FND-013",
  src004Preserved: Boolean(src),
  atlasV16Preserved: Boolean(v16) && store.getVersion("atlas-v16").contentHash === FROZEN["atlas-v16"],
  servingVersionId: ws && ws.servingAtlasVersionId,
  originalProposedIds: ce.map((e) => e.id),
  dispositionIds: (out.dispositions || []).map((d) => d && d.id).filter(Boolean),
  attributionId: out.attribution && out.attribution.id,
  invalidationIds: (out.invalidations || []).map((x) => x && x.review && x.review.id).filter(Boolean),
  originalAfter: (out.invalidations || []).map((x) => x && x.original && ({ id: x.original.id, state: x.original.state, effective: x.original.effective })),
  remediationIds: (out.remediations || []).map((r) => r && r.id).filter(Boolean),
  investigationIds: (out.investigations || []).map((r) => r && r.id),
}, null, 2));
