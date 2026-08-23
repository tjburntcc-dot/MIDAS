import { projectRuntimeCase } from "./project.js";

const ACTION_FOR = {
  qualified: "prioritize_outreach",
  needs_research: "research_first",
  disqualified: "exclude",
};

function policyNamesOnCase(record) {
  const bits = [];
  const pol = record.qualification_policy || {};
  for (const list of [pol.required || [], pol.preferred || [], pol.disqualifiers || []]) {
    for (const item of list) bits.push(String(item));
  }
  for (const c of record.constraints || []) bits.push(String(c));
  return bits.join(" ");
}

function namesOwnerPolicy(record) {
  return /Atlas Owner Policy:/i.test(policyNamesOnCase(record));
}

function observableDisqualifier(record, prospect) {
  const facts = prospect.facts || {};
  const blob = JSON.stringify({ facts: facts, evidence: prospect.evidence || [] }).toLowerCase();
  if (facts.opted_out === true) return "opted_out";
  if (facts.open_roles === 0) return "open_roles=0";
  if (facts.hiring_freeze === true) return "hiring_freeze";
  if (facts.approved_budget === false) return "approved_budget=false";
  if (facts.buyer_authority === "none" || facts.buyer_authority === "hq_only" || facts.buyer_authority === "forbidden" || facts.buyer_authority === "title_only") {
    return "buyer_authority=" + facts.buyer_authority;
  }
  if (facts.local_authority === "forbidden" || facts.local_authority === "hq_only") return "local_authority";
  if (facts.accepting_new_patients === false) return "closed_panel";
  if (facts.requires_patient_records === true) return "patient_records";
  if (facts.platform === "marketplace_only") return "marketplace_only";
  if (facts.service === "commercial_only") return "commercial_only";
  if (facts.industry === "bookkeeping" || facts.industry === "recruiting_agency" || facts.industry === "lead_generation_agency") {
    return "excluded_industry";
  }
  if (facts.country === "CA" || facts.country === "PE") return "non_us_country";
  if (typeof facts.members === "number" && facts.members < 300) return "members";
  if (typeof facts.inventory_days === "number" && facts.inventory_days < 45) return "inventory";
  if (typeof facts.distance_miles === "number" && facts.distance_miles > 35) return "distance";
  if (typeof facts.employee_count === "number" && facts.employee_count < 8) return "employee_count";
  if (typeof facts.seat_count === "number" && facts.seat_count < 4) return "seat_count";
  if (typeof facts.payback_months === "number" && facts.payback_months > 9) return "payback_months";
  if (facts.region === "Pacific Northwest" || facts.region === "International") return "region";
  if (facts.account_status === "existing_customer") return "existing_customer";
  if (facts.vertical === "public_sector") return "public_sector";
  if (/freeze|opt-out|opted out|outside|forbidden|headquarters-only|marketplace-only|commercial-only/.test(blob)) {
    return "evidence_language";
  }
  return null;
}

export function suiteAudit(cases, opts = {}) {
  const findings = [];
  const caseReports = [];
  for (const record of cases || []) {
    const report = { case_id: record.case_id, ok: true, notes: [] };
    let runtime = null;
    try {
      runtime = projectRuntimeCase(record);
    } catch (err) {
      findings.push({ case_id: record.case_id, code: "RUNTIME_PROJECTION_FAILED", message: err instanceof Error ? err.message : String(err) });
      report.ok = false;
      caseReports.push(report);
      continue;
    }
    const serialized = JSON.stringify(runtime);
    if (Object.prototype.hasOwnProperty.call(runtime, "gold") || /"gold"\s*:/.test(serialized) || serialized.includes("ranked_tiers") || serialized.includes("required_unknowns") || serialized.includes("required_evidence")) {
      findings.push({ case_id: record.case_id, code: "GOLD_IN_RUNTIME", message: "projectRuntimeCase leaked gold" });
      report.ok = false;
    }

    const catalog = new Set((record.runtime_field_catalog || opts.runtimeFieldCatalog || []).map(String));
    const gold = record.gold || {};
    const byId = new Map((record.prospects || []).map((p) => [p.id, p]));

    for (const [pid, fields] of Object.entries(gold.required_unknowns || {})) {
      const prospect = byId.get(pid);
      if (!prospect) {
        findings.push({ case_id: record.case_id, code: "UNKNOWN_PROSPECT", message: "required_unknowns prospect missing: " + pid });
        report.ok = false;
        continue;
      }
      for (const field of fields || []) {
        const onFacts = Object.prototype.hasOwnProperty.call(prospect.facts || {}, field);
        if (!onFacts && !catalog.has(field)) {
          findings.push({
            case_id: record.case_id,
            code: "INVISIBLE_GOLD_KEY",
            message: pid + " gold required_unknowns " + field + " is not a runtime fact and is not on a declared runtime field catalog",
          });
          report.ok = false;
        }
      }
    }

    for (const [pid, ids] of Object.entries(gold.required_evidence || {})) {
      const prospect = byId.get(pid);
      const have = new Set((prospect && prospect.evidence ? prospect.evidence : []).map((e) => e.id));
      for (const id of ids || []) {
        if (!have.has(id)) {
          findings.push({ case_id: record.case_id, code: "MISSING_REQUIRED_EVIDENCE", message: pid + " missing evidence " + id });
          report.ok = false;
        }
      }
    }

    for (const [pid, label] of Object.entries(gold.labels || {})) {
      const action = (gold.actions || {})[pid];
      if (ACTION_FOR[label] && action !== ACTION_FOR[label]) {
        findings.push({ case_id: record.case_id, code: "ACTION_LABEL_MISMATCH", message: pid + " " + label + " vs " + action });
        report.ok = false;
      }
      const prospect = byId.get(pid);
      if (!prospect) continue;
      const unknowns = (gold.required_unknowns || {})[pid] || [];
      if (label === "qualified" && unknowns.length) {
        findings.push({ case_id: record.case_id, code: "QUALIFIED_WITH_UNKNOWNS", message: pid + " is qualified but has required_unknowns" });
        report.ok = false;
      }
      if (label === "needs_research" && unknowns.length === 0 && !namesOwnerPolicy(record)) {
        findings.push({ case_id: record.case_id, code: "RESEARCH_WITHOUT_UNKNOWN", message: pid + " needs_research without unknowns or named owner policy" });
        report.ok = false;
      }
      if (label === "disqualified") {
        const obs = observableDisqualifier(record, prospect);
        if (!obs && !namesOwnerPolicy(record)) {
          findings.push({ case_id: record.case_id, code: "DISQUALIFIER_NOT_OBSERVABLE", message: pid + " disqualified without observable fact/evidence" });
          report.ok = false;
        } else {
          report.notes.push(pid + " disqualifier observable:" + (obs || "named-owner-policy"));
        }
      }
    }
    caseReports.push(report);
  }
  return {
    ok: findings.length === 0,
    findings: findings,
    caseReports: caseReports,
    caseCount: (cases || []).length,
  };
}

export function writeAuditIntoManifest(manifest, audit) {
  return {
    ...manifest,
    audit: {
      ok: audit.ok,
      findings: audit.findings,
      caseCount: audit.caseCount,
      auditedAt: new Date().toISOString(),
    },
  };
}
