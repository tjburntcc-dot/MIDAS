"use client";

import { useCallback, useEffect, useState } from "react";

type Version = {
  id: string;
  declaredChange: string;
  contentHash: string;
  createdAt: string;
  curriculumSnapshotId: string | null;
};

type Run = {
  id: string;
  agentVersionId: string;
  suiteVersion: string;
  arm: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

type Assessment = {
  prospect_id: string;
  classification: string;
  cited_evidence_ids: string[];
  missing_information: string[];
  next_action: string;
  rationale: string;
};

type CaseView = {
  id: string;
  caseId: string;
  title?: string;
  weightedTotal: number;
  dimensions: Record<string, number>;
  criticalFailures: { code: string; message: string }[];
  assessments?: Assessment[];
  ranked_qualified_ids?: string[];
  evidence_detail?: { deterministic: number; semantic: number; semantic_judge_status: string };
  compliance_violations?: string[];
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export default function Page() {
  const [atlas, setAtlas] = useState<any>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");

  const refresh = useCallback(async () => {
    const [a, r, k] = await Promise.all([
      api("/agents/atlas"),
      api("/eval-runs"),
      api("/knowledge"),
    ]);
    setAtlas(a);
    setRuns(r.runs ?? []);
    setKnowledge(k.items ?? []);
    if (r.runs?.length) {
      const latest = r.runs[r.runs.length - 1];
      const detail = await api(`/eval-runs/${latest.id}`);
      setSelected(detail);
    }
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message ?? e)));
  }, [refresh]);

  async function createAtlas() {
    setBusy("create");
    setError(null);
    try {
      await api("/agents", { method: "POST", body: JSON.stringify({ name: "Atlas" }) });
      await refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function runEval() {
    setBusy("eval");
    setError(null);
    try {
      const versionId = atlas?.currentVersion?.id ?? "atlas-v0";
      const out = await api(`/agents/atlas/versions/${versionId}/eval`, { method: "POST", body: "{}" });
      setSelected(out);
      await refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function decide(kind: "promote" | "reject") {
    if (!selected?.run?.id) return;
    setBusy(kind);
    setError(null);
    try {
      await api(`/eval-runs/${selected.run.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ kind, rationale }),
      });
      await refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  const cases: CaseView[] = (selected?.results ?? []).map((r: any) => {
    const detail = (selected?.details ?? []).find((d: any) => d.caseId === r.caseId);
    return { ...r, ...detail };
  });

  return (
    <main>
      <h1>MIDAS Control Room</h1>
      <p className="muted">
        VS-001 walking slice. Persistence is FILE_STORE (JSON files), not PostgreSQL. Semantic
        evidence judge is not implemented. Fixture responders are never live model output.
      </p>
      <div className="banner">
        Store: {atlas?.store ?? "FILE_STORE"} — Drizzle schema is the future PG contract only.
        Knowledge items: {knowledge.length} (empty until curriculum extraction).
      </div>
      {error ? <p className="fail">{error}</p> : null}

      <div className="grid">
        <section className="card">
          <h2>Atlas</h2>
          {atlas?.agent ? (
            <p>
              {atlas.agent.name} ({atlas.agent.id}) created {atlas.agent.createdAt}
            </p>
          ) : (
            <p className="muted">Atlas has not been created yet.</p>
          )}
          <p>
            Current version: {atlas?.currentVersion?.id ?? "—"}
            {atlas?.currentVersion ? ` · ${atlas.currentVersion.declaredChange}` : ""}
          </p>
          <p>
            Challenger: {atlas?.challengerVersion?.id ?? "none yet"}
          </p>
          <button disabled={busy !== null} onClick={createAtlas}>
            {busy === "create" ? "Creating…" : "Create Atlas + freeze v0"}
          </button>{" "}
          <button disabled={busy !== null || !atlas?.currentVersion} onClick={runEval}>
            {busy === "eval" ? "Running 8 cases…" : "Run development eval (8 cases)"}
          </button>
        </section>

        <section className="card">
          <h2>Run history</h2>
          {runs.length === 0 ? <p className="muted">No eval runs yet.</p> : null}
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  onClick={async () => setSelected(await api(`/eval-runs/${run.id}`))}
                >
                  {run.id.slice(0, 8)} · {run.status} · {run.arm} · {run.createdAt}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Selected run</h2>
          {selected?.run ? (
            <>
              <p>
                {selected.run.id} · {selected.run.status} · responder {selected.responder?.kind ?? "unknown"}
                {selected.responder?.kind === "fixture" ? " (labeled fixture, not a live model)" : ""}
              </p>
              <p className="muted">{selected.responder?.note}</p>
              <p>Semantic judge: {selected.semanticJudge ?? "not_implemented"}</p>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Decision rationale"
                rows={3}
                style={{ width: "100%" }}
              />
              <p>
                <button disabled={busy !== null} onClick={() => decide("promote")}>
                  Promote
                </button>{" "}
                <button disabled={busy !== null} onClick={() => decide("reject")}>
                  Reject
                </button>
              </p>
              {(selected.decisions ?? []).map((d: any) => (
                <p key={d.id}>
                  Decision: {d.kind} — {d.rationale}
                </p>
              ))}
            </>
          ) : (
            <p className="muted">Create Atlas and run the development suite.</p>
          )}
        </section>
      </div>

      <h2>Per-case results</h2>
      {cases.length === 0 ? <p className="muted">No case results loaded.</p> : null}
      {cases.map((c) => (
        <section className="card" key={c.id}>
          <h3>
            {c.caseId} — {c.title ?? ""} · total {Number(c.weightedTotal ?? 0).toFixed(1)}
          </h3>
          <p className="muted">
            Q {c.dimensions?.qualification} · Rank {c.dimensions?.ranking} · Ev{" "}
            {c.dimensions?.evidence} · Unc {c.dimensions?.uncertainty} · Act{" "}
            {c.dimensions?.nextAction ?? c.dimensions?.next_action} · Comp{" "}
            {c.dimensions?.compliance}
            {c.evidence_detail
              ? ` · evidence deterministic ${c.evidence_detail.deterministic}, semantic ${c.evidence_detail.semantic_judge_status}`
              : ""}
          </p>
          {(c.criticalFailures ?? []).length > 0 ? (
            <p className="fail">
              Critical failures: {c.criticalFailures.map((f) => `${f.code}: ${f.message}`).join(" | ")}
            </p>
          ) : (
            <p className="muted">No critical failures recorded.</p>
          )}
          <table>
            <thead>
              <tr>
                <th>Prospect</th>
                <th>Class</th>
                <th>Citations</th>
                <th>Missing</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(c.assessments ?? []).map((a) => (
                <tr key={a.prospect_id}>
                  <td>{a.prospect_id}</td>
                  <td>{a.classification}</td>
                  <td>{a.cited_evidence_ids.join(", ") || "—"}</td>
                  <td>{a.missing_information.join(", ") || "—"}</td>
                  <td>{a.next_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
