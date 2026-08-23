import { requireWorkspaceId, listApprovedKnowledgeInWorkspace } from "./workspace-isolation.ts";
/** Checkpoint 22 generic team generator. Deterministic subset from workspace objective. Not a copy of another company team. */
import { contentHash } from "@midas/db";
import { SEARCH_INTEGRATION_EXISTS } from "./source-acquisition.ts";
import { isIsolatedOwnerWorkspace } from "./company-intake.ts";

export const TEAM_GENERATOR = "deterministic_objective_subset";

export const TEAM_EMPLOYEE_STATUS = "authorized_for_supervised_internal";

export const TEAM_HONESTY = {
  persistence: "FILE_STORE",
  thisSlice: "deterministic",
  generator: TEAM_GENERATOR,
  liveProviderCall: false,
  fixtureLabeledAsLive: false,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
  embeddings: false,
  outreach: false,
  autonomous: false,
  autoPromoted: false,
  silentCreate: false,
  demoOperatorIsLocalOwner: false,
  copiesReferenceSpecialistSet: false,
  note: "Deterministic team proposal from workspace objective/intake. Not optimal. Create requires one explicit owner action (Create this team). demo_operator is not local_owner. Employees are real records with basic deterministic task handlers, not live model work.",
};

export const SHARED_PROHIBITIONS = [
  "outreach",
  "rewrite_owner_policy",
  "cross_workspace_access",
  "unlimited_spend",
  "autonomous_action",
  "auto_promotion",
  "policy_rewrite",
];

export const SHARED_TOOLS = [
  "read_approved_workspace_knowledge",
  "receive_task",
  "write_labeled_deterministic_output",
];

export const ROLE_CATALOG = [
  {
    roleId: "workflow_manager",
    category: "manager_conductor",
    roleTitle: "Manager / Conductor",
    name: "Manager",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Coordinates supervised internal work from the company objective. Does not hire, spend, or act autonomously.",
    defaultObjective: "Keep this company's first internal work sequenced and visible to the owner.",
    tools: ["plan_supervised_work", "read_workspace_objective"],
    responsibilities: ["propose_internal_sequence", "surface_blockers_to_owner"],
  },
  {
    roleId: "business_research",
    category: "researcher_scout",
    roleTitle: "Researcher / Scout",
    name: "Researcher",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Turns owner intake into labeled research questions. Cannot search the open web.",
    defaultObjective: "List inspectable questions and already-known owner facts for this workspace only.",
    tools: ["read_workspace_intake"],
    responsibilities: ["list_research_questions", "label_unknowns"],
  },
  {
    roleId: "offer_strategist",
    category: "opportunity_offer_strategist",
    roleTitle: "Opportunity / offer strategist",
    name: "Offer Strategist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Drafts a labeled offer hypothesis from owner-provided facts. Does not invent demand or TAM.",
    defaultObjective: "Propose one inspectable offer hypothesis from this workspace's owner facts.",
    tools: ["read_workspace_intake"],
    responsibilities: ["draft_offer_hypothesis", "list_validation_gaps"],
  },
  {
    roleId: "marketing",
    category: "marketing_content",
    roleTitle: "Marketing / content specialist",
    name: "Marketing specialist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Drafts internal content outlines from owner facts. No outbound messages.",
    defaultObjective: "Draft a content outline the owner can review. No outreach.",
    tools: ["read_workspace_intake"],
    responsibilities: ["draft_content_outline"],
  },
  {
    roleId: "product",
    category: "product_engineering",
    roleTitle: "Product / engineering specialist",
    name: "Product specialist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Lists a first internal build slice from the stated product/software objective.",
    defaultObjective: "Name a first supervised build slice. Not a shipped product.",
    tools: ["read_workspace_intake"],
    responsibilities: ["list_first_build_slice"],
  },
  {
    roleId: "ops",
    category: "operations",
    roleTitle: "Operations specialist",
    name: "Operations specialist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Turns owner procedures and constraints into a first internal checklist.",
    defaultObjective: "Write a first operations checklist from owner-supplied facts only.",
    tools: ["read_workspace_intake"],
    responsibilities: ["draft_ops_checklist"],
  },
  {
    roleId: "finance",
    category: "finance_unit_economics",
    roleTitle: "Finance / unit-economics analyst",
    name: "Finance analyst",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Restates owner budget and gaps. Does not invent revenue, TAM, or conversion.",
    defaultObjective: "Restate the owner-stated budget and list unknown unit-economics fields.",
    tools: ["read_workspace_intake"],
    responsibilities: ["restate_owner_budget", "list_unknown_unit_economics"],
  },
  {
    roleId: "independent_audit",
    category: "watcher_auditor",
    roleTitle: "Watcher / auditor",
    name: "Watcher",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Checks teammate outputs for outreach, invented demand, and isolation leaks. Advisory only.",
    defaultObjective: "Audit teammate outputs for this workspace. Cannot rewrite policy.",
    tools: ["read_teammate_outputs"],
    responsibilities: ["flag_outreach", "flag_invented_market", "flag_isolation_leak"],
  },
  {
    roleId: "atlas",
    category: "atlas_prospect_qualification",
    roleTitle: "Atlas",
    name: "Atlas",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    jobDescription: "Fictional/test prospect qualification only when the objective is about qualifying prospects. No outreach.",
    defaultObjective: "Qualify fictional or owner-supplied prospects for this workspace only.",
    tools: ["read_workspace_intake"],
    responsibilities: ["classify_fictional_prospect"],
  },
  {
    roleId: "sales",
    category: "sales",
    roleTitle: "Sales strategist",
    name: "Sales strategist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    planningOnly: true,
    jobDescription: "INTERNAL PLANNING ONLY. Draft discovery questions and a pipeline hypothesis from owner facts. No outreach, email, CRM send, purchase, publish, hire, or policy.",
    defaultObjective: "Write an internal sales plan the owner can inspect. Do not contact anyone.",
    tools: ["read_approved_workspace_knowledge"],
    responsibilities: ["sales_planning", "pipeline_hypothesis", "discovery_questions"],
    prohibitedActions: ["outreach", "email", "purchase", "publish", "hire", "policy_rewrite", "cross_workspace"],
  },
  {
    roleId: "executive",
    category: "executive",
    roleTitle: "Executive strategist",
    name: "Executive strategist",
    implementationStatus: "implemented_basic",
    handlerExists: true,
    planningOnly: true,
    jobDescription: "INTERNAL PLANNING ONLY. Priority and tradeoff memo from owner constraints. No outreach, hire, policy, purchase, publish, or cross-workspace.",
    defaultObjective: "Write an internal priority memo. Do not hire, rewrite policy, or act outside this company.",
    tools: ["read_approved_workspace_knowledge"],
    responsibilities: ["executive_planning", "priority_memo", "tradeoff_brief"],
    prohibitedActions: ["outreach", "email", "purchase", "publish", "hire", "policy_rewrite", "cross_workspace"],
  },
];

export const REFERENCE_SPECIALIST_ROLE_SET = [
  "atlas",
  "business_research",
  "offer_strategist",
  "workflow_manager",
  "independent_audit",
];

function nowIso() {
  return new Date().toISOString();
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function fieldValue(field) {
  if (field == null) return "";
  if (typeof field === "object" && !Array.isArray(field) && "value" in field) {
    const v = field.value;
    if (Array.isArray(v)) return v.join(", ");
    return asText(v);
  }
  if (Array.isArray(field)) return field.join(", ");
  return asText(field);
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "").trim();
}

function catalogById(roleId) {
  return ROLE_CATALOG.find((r) => r.roleId === roleId) || null;
}

export function collectWorkspaceSignals(workspace) {
  const intake = workspace && workspace.intake;
  const fields = (intake && intake.fields) || {};
  const ownerObjective = fieldValue(fields.ownerObjective) || asText(workspace && (workspace.goal || workspace.description));
  const goals = fieldValue(fields.goals);
  const description = fieldValue(fields.businessDescription) || asText(workspace && workspace.description);
  const industries = fieldValue(fields.preferredIndustries);
  const skills = fieldValue(fields.availableSkillsAndResources) || fieldValue(fields.availableResources);
  const challenges = fieldValue(fields.currentChallenges);
  const offer = fieldValue(fields.existingOffer) || asText(workspace && workspace.offer && (workspace.offer.summary || workspace.offer.name));
  const customer = fieldValue(fields.customerProfile) || asText(workspace && workspace.idealCustomer);
  const budget = fieldValue(fields.budget);
  const constraints = fieldValue(fields.ownerConstraints) || fieldValue(fields.geographicConstraints);
  const procedures = fieldValue(fields.existingProcedures);
  const risk = fieldValue(fields.riskTolerance);
  const text = [
    ownerObjective, goals, description, industries, skills, challenges, offer, customer,
    budget, constraints, procedures, risk, asText(workspace && workspace.name),
    asText(workspace && workspace.industry), asText(workspace && workspace.type),
  ].filter(Boolean).join(" \n ");
  return {
    workspaceId: workspace && workspace.id,
    ownerObjective: ownerObjective || goals || description,
    goals,
    description,
    industries,
    skills,
    challenges,
    offer,
    customer,
    budget,
    constraints,
    procedures,
    intakeKind: (intake && intake.kind) || workspace && workspace.intakeKind || null,
    text,
    hasBudget: Boolean(budget),
  };
}

export function selectRoleIds(signals) {
  const t = String((signals && signals.text) || "").toLowerCase();
  const selected = new Set(["workflow_manager", "independent_audit"]);
  const reasons = {
    workflow_manager: "Every initial team needs a supervised coordinator for the stated objective.",
    independent_audit: "A watcher checks teammate output for outreach, invented demand, and isolation leaks.",
  };
  const add = (id, reason) => {
    selected.add(id);
    if (!reasons[id]) reasons[id] = reason;
  };

  if (/(research|scout|find a |find an |discover|investigat|learn about|opportunit|durable|new business)/i.test(t)) {
    add("business_research", "The objective asks to find, research, or inspect something still unknown.");
  }
  if (/(offer|sell |selling|pricing|monetiz|packag|strategist|revenue goal)/i.test(t)) {
    add("offer_strategist", "The objective mentions an offer, sale, or monetization hypothesis.");
  }
  if (/(marketing|content|writing|newsletter|brand|blog|audience|copywriting|social)/i.test(t)) {
    add("marketing", "The objective or skills mention marketing or content.");
  }
  if (/(software|engineer|saas|application|codebase|technical product|platform|app for|qualif)/i.test(t) && /(software|app|saas|platform|engineer|product)/i.test(t)) {
    add("product", "The objective mentions a software or product slice.");
  }
  if (/(operat|process|staff|bakery|baker|service|delivery|shop|storefront|procedure|oven|local services|neighborhood)/i.test(t)) {
    add("ops", "The objective describes an operating service, shop, or procedure.");
  }
  if (/(budget|finance|unit.econ|cost|margin|spend|economics)/i.test(t) || (signals && signals.hasBudget)) {
    add("finance", "The owner stated a budget or asked about cost/unit economics.");
  }
  if (/(prospect|qualif|lead scoring|contractor software|b2b saas|sales pipeline|takeoff and estimat)/i.test(t)) {
    add("atlas", "Prospect qualification is relevant to this objective. Atlas is included only for that reason.");
  }

  if (selected.size <= 2) {
    add("ops", "No specialist signal was strong. Operations is the generic useful third seat.");
    add("business_research", "No specialist signal was strong. A researcher can list unknowns from intake.");
  }

  if (/(sales plan|pipeline|discovery call|who to talk to first|internal sales)/i.test(t)) {
    add("sales", "Owner asked for an internal sales plan. Planning only. No outreach.");
  }
  if (/(priority memo|what should we do first|executive brief|tradeoff|sequenc(e|ing) bets)/i.test(t)) {
    add("executive", "Owner asked for an internal priority or tradeoff memo. Planning only.");
  }

  let ids = ROLE_CATALOG.map((r) => r.roleId).filter((id) => selected.has(id));
  if (ids.length > 6) {
    const dropOrder = ["finance", "marketing", "product"];
    for (const d of dropOrder) {
      if (ids.length <= 6) break;
      ids = ids.filter((id) => id !== d);
      delete reasons[d];
    }
  }
  return { roleIds: ids, reasons };
}

export function roleIsImplemented(roleId) {
  const spec = catalogById(roleId);
  return Boolean(spec && spec.handlerExists && spec.implementationStatus === "implemented_basic");
}

function workspaceKnowledge(store, workspaceId, extras) {
  const exclude = new Set((extras && extras.excludeIds) || []);
  const ws = requireWorkspaceId(workspaceId);
  const items = listApprovedKnowledgeInWorkspace(store, ws, {}).filter((k) => {
    if (exclude.has(k.id)) return false;
    return true;
  });
  return items.map((k) => ({
    id: k.id,
    statement: String(k.statement || "").slice(0, 240),
    classification: k.classification || k.kind || k.claimKind || null,
    enteredRetrievalIndex: k.enteredRetrievalIndex === true || k.reviewStatus === "approved" || k.accepted === true,
  }));
}

function labeledOutput(kind, summary, extra) {
  return {
    kind: kind,
    label: "deterministic",
    claimClass: "model_generated_hypothesis",
    liveProviderCall: false,
    liveModelWork: false,
    summary: summary,
    note: "Labeled deterministic output. Not live model work. Not a fixture labeled as live.",
    ...(extra || {}),
  };
}

export const ROLE_HANDLERS = {
  workflow_manager(ctx) {
    const teammate = (ctx.teammateOutputs || []).map((o) => clip((o && o.summary) || "", 140)).filter(Boolean);
    const kind = asText(ctx.taskKind);
    if (kind === "manager_summary" || /summary/i.test(kind)) {
      return labeledOutput(
        "owner_summary",
        teammate.length
          ? "Owner summary from persisted specialist results: " + teammate[0]
          : "Owner summary: supervised internal work completed from persisted records.",
        {
          persistedResultCount: teammate.length,
          nextSteps: [
            "Owner reviews persisted task results. Not autonomous.",
            "Artifact generation is Checkpoint 24.",
          ],
        },
      );
    }
    return labeledOutput(
      "supervised_plan",
      "Supervised sequence for: " + clip(ctx.objective || ctx.input, 180),
      {
        nextSteps: [
          "Owner reviews this plan. Not autonomous.",
          "Specialists wait for an explicit task.",
          "Results persist as labeled deterministic handler output.",
        ],
      },
    );
  },
  business_research(ctx) {
    const known = (ctx.knowledge || []).slice(0, 4).map((k) => k.statement || k.excerpt).filter(Boolean);
    const kind = asText(ctx.taskKind) + " " + asText(ctx.input) + " " + asText(ctx.ownerText);
    if (/idea_hypotheses|three|promising|business ideas/i.test(kind)) {
      const seed = clip(ctx.industries || ctx.description || ctx.offer || ctx.objective || ctx.input, 100) || "owner-stated interest";
      return labeledOutput(
        "idea_hypotheses",
        "Three labeled idea hypotheses from owner facts only. Not researched demand.",
        {
          ideas: [
            { title: "Owner-fact variant A", text: "A inspectable hypothesis using: " + seed, claimClass: "model_generated_hypothesis" },
            { title: "Owner-fact variant B", text: "A narrower local variant of the same owner-stated interest.", claimClass: "model_generated_hypothesis" },
            { title: "Owner-fact variant C", text: "An adjacent offer using only skills/resources the owner already listed: " + clip(ctx.skills || "unknown", 80), claimClass: "model_generated_hypothesis" },
          ],
          count: 3,
          invented: { tam: false, demand: false, conversion: false, expectedRevenue: false },
          alreadyKnown: known,
        },
      );
    }
    if (/competitor|product features|competitor_summary/i.test(kind)) {
      const features = known.filter((s) => /feature|product|competitor|pricing|alternative/i.test(String(s)));
      return labeledOutput(
        "competitor_summary",
        features.length
          ? "Competitor/feature notes from approved workspace knowledge only."
          : "No approved workspace knowledge describes competitor product features. Research requested. Search integration does not exist.",
        {
          fromApprovedKnowledge: features.slice(0, 6),
          alreadyKnown: known,
          inventedFeatures: false,
          fetched: false,
          searchIntegrationExists: false,
          unknown: ["Open-web competitor crawl is not built.", "Unstated product features stay unknown."],
        },
      );
    }
    return labeledOutput(
      "research_questions",
      "Inspectable questions from owner intake. Search integration does not exist.",
      {
        questions: [
          "What owner-supplied facts are already stored?",
          "What is still unknown and must stay unknown?",
          clip(ctx.objective, 160) ? "How does the objective constrain the next permitted source?" : "What objective did the owner state?",
        ],
        alreadyKnown: known,
        unknown: ["Open-web search is not built.", "Demand, TAM, and conversion are unknown."],
      },
    );
  },
  offer_strategist(ctx) {
    const kind = asText(ctx.taskKind) + " " + asText(ctx.input);
    const positioning = /position|offer_positioning/i.test(kind);
    return labeledOutput(
      positioning ? "offer_positioning" : "offer_hypothesis",
      (positioning ? "Offer and positioning hypothesis from owner facts only: " : "Offer hypothesis from owner facts only: ")
        + clip(ctx.offer || ctx.objective || ctx.input, 160),
      {
        positioning: positioning
          ? "For " + clip(ctx.customer || "the owner-stated customer", 80) + ", restated offer: " + clip(ctx.offer || ctx.objective || "unknown", 120)
          : null,
        invented: { tam: false, demand: false, conversion: false, expectedRevenue: false },
        validationGaps: ["Willingness to pay is unknown.", "Demand is unknown.", "No live market research ran."],
        usedLessons: (ctx.knowledge || []).filter((k) => k.classification === "company_fact" || k.classification === "procedure" || k.classification === "owner_policy" || k.classification === "correction").map((k) => k.id),
        lessonNotes: (ctx.knowledge || []).filter((k) => k.classification === "company_fact" || k.classification === "procedure" || k.classification === "owner_policy").map((k) => clip(k.statement, 160)).slice(0, 4),
      },
    );
  },
  marketing(ctx) {
    const kind = asText(ctx.taskKind) + " " + asText(ctx.input) + " " + asText(ctx.ownerText);
    const lessons = (ctx.knowledge || []).filter((k) => {
      const c = String(k.classification || "");
      return c === "company_fact" || c === "sourced_fact" || c === "procedure" || c === "owner_policy" || c === "correction" || c === "directly_supported_fact";
    });
    const lessonLines = lessons.map((k) => "Source-backed lesson (" + (k.classification || "fact") + "): " + clip(k.statement, 200));
    const usedLessons = lessons.map((k) => k.id);
    if (/landing/i.test(kind)) {
      return labeledOutput(
        "landing_outline",
        "Landing-page outline and customer-problem restatement. No file generated.",
        {
          customerProblem: clip(ctx.challenges || ctx.customer || ctx.objective || "unknown", 180),
          outline: [
            "Problem as stated: " + clip(ctx.challenges || ctx.customer || "unknown", 140),
            "Offer/facts as stated: " + clip(ctx.offer || ctx.objective || "unknown", 140),
            ...lessonLines,
            "Do not email, post, or contact anyone.",
          ],
          artifactGenerated: false,
          landingPageFile: null,
          outreach: false,
          usedLessons: usedLessons,
          retrievedLessonIds: usedLessons,
          note: "Outline only. Artifact generation is Checkpoint 24.",
        },
      );
    }
    if (/flyer|library|bulletin|community_channel|haywood|program calendar/i.test(kind)) {
      return labeledOutput(
        "flyer_planning_research",
        lessons.length
          ? "Internal flyer-planning research note citing retrieved source-backed library facts. No outbound send."
          : "Internal flyer-planning research note. No source-backed library lessons retrieved. No outbound send.",
        {
          outline: [
            "Audience as stated by the owner: " + clip(ctx.customer || "unknown", 120),
            "Offer/facts as stated: " + clip(ctx.offer || ctx.objective || "unknown", 120),
            ...(lessonLines.length ? lessonLines : ["No approved library location/hours/program-calendar lessons retrieved for this run."]),
            "Do not claim demand, TAM, conversion, revenue, or bulletin posting permission.",
            "Do not email, post, or contact anyone.",
          ],
          citations: lessonLines.slice(),
          usedLessons: usedLessons,
          retrievedLessonIds: usedLessons,
          outreach: false,
          inventedDemand: false,
        },
      );
    }
    return labeledOutput(
      "content_outline",
      "Internal content outline. No outbound send.",
      {
        outline: [
          "Audience as stated by the owner: " + clip(ctx.customer || "unknown", 120),
          "Offer/facts as stated: " + clip(ctx.offer || ctx.objective || "unknown", 120),
          ...lessonLines,
          "Do not email, post, or contact anyone.",
        ],
        usedLessons: usedLessons,
        retrievedLessonIds: usedLessons,
        outreach: false,
      },
    );
  },
  product(ctx) {
    return labeledOutput(
      "build_slice",
      "First supervised build slice from the stated product objective.",
      {
        slice: clip(ctx.objective || ctx.input, 180) || "Owner has not named a product slice.",
        notShipped: true,
        artifactGenerated: false,
      },
    );
  },
  ops(ctx) {
    return labeledOutput(
      "ops_checklist",
      "First operations checklist from owner-supplied facts.",
      {
        checklist: [
          ctx.procedures ? "Honor owner procedures: " + clip(ctx.procedures, 140) : "No owner procedures stored yet.",
          ctx.constraints ? "Honor owner constraints: " + clip(ctx.constraints, 140) : "No extra owner constraints stored.",
          ...((ctx.knowledge || []).filter((k) => k.classification === "procedure" || k.classification === "correction" || k.classification === "owner_policy").map((k) => "Approved lesson: " + clip(k.statement, 160))),
          "Do not invent staffing, demand, or delivery promises.",
        ],
        usedLessons: (ctx.knowledge || []).filter((k) => k.classification === "procedure" || k.classification === "correction" || k.classification === "owner_policy").map((k) => k.id),
      },
    );
  },
  finance(ctx) {
    const knownCosts = [];
    if (ctx.budget) knownCosts.push({ label: "owner_stated_budget_ceiling", value: ctx.budget, claimClass: "owner_provided", note: "Ceiling from owner input. Not a researched cost." });
    const assumptions = [
      { label: "price_to_charge", value: null, claimClass: "unknown", note: "Unknown unless the owner stored a price." },
      { label: "cost_to_deliver_one_unit", value: null, claimClass: "unknown", note: "Unknown unless the owner stored a cost." },
      { label: "conversion", value: null, claimClass: "unknown", note: "Unknown. Not invented." },
      { label: "repeat_purchase", value: null, claimClass: "unknown", note: "Unknown. Not invented." },
      { label: "profitability", value: null, claimClass: "unknown", note: "Not invented. Profitability is not computed from missing numbers." },
    ];
    const worksheet = {
      knownCosts: knownCosts,
      assumptions: assumptions,
      inventedProfitability: false,
      invented: { tam: false, demand: false, conversion: false, expectedRevenue: false, profitability: false },
      unknown: ["unit economics", "conversion", "expected revenue", "TAM", "profitability"],
      budget: ctx.budget || null,
    };
    const kind = asText(ctx.taskKind) + " " + asText(ctx.input);
    if (/unit_econ|assumption/i.test(kind)) {
      return labeledOutput(
        "unit_economics_assumptions",
        ctx.budget
          ? "Owner-stated budget ceiling: " + clip(ctx.budget, 80) + ". Assumptions below still need validation."
          : "No owner-stated budget. Unit-economics assumptions remain unknown until the owner supplies them.",
        {
          ...worksheet,
          assumptionsToValidate: assumptions.map((a) => a.note),
        },
      );
    }
    return labeledOutput(
      "assumptions_worksheet",
      ctx.budget
        ? "Structured assumptions worksheet. Known cost: owner-stated budget ceiling " + clip(ctx.budget, 80) + ". Profitability not invented."
        : "Structured assumptions worksheet. No known costs. Profitability not invented.",
      worksheet,
    );
  },
  sales(ctx) {
    const known = (ctx.knowledge || []).slice(0, 4).map((k) => k.statement || k.excerpt).filter(Boolean);
    return labeledOutput(
      "sales_planning",
      "Internal sales plan from owner facts only. No outreach.",
      {
        planningOnly: true,
        outreach: false,
        email: false,
        discoveryQuestions: [
          "Who already asked the owner about this work?",
          "What conversation would stay inside the owner-stated geography and budget?",
          "What would the owner need to hear before any contact is even drafted?",
        ],
        pipelineHypothesis: "A first inspectable conversation list is a hypothesis. No names are invented. No email is sent.",
        alreadyKnown: known,
        usedLessons: (ctx.knowledge || []).filter((k) => k.classification === "company_fact" || k.classification === "owner_policy" || k.classification === "correction").map((k) => k.id),
        forbidden: ["outreach", "email", "purchase", "publish", "hire", "policy_rewrite", "cross_workspace"],
      },
    );
  },
  executive(ctx) {
    const known = (ctx.knowledge || []).slice(0, 4).map((k) => k.statement || k.excerpt).filter(Boolean);
    return labeledOutput(
      "executive_planning",
      "Internal priority memo from owner constraints. No hire, policy, or outreach.",
      {
        planningOnly: true,
        hire: false,
        policyRewrite: false,
        priorities: [
          "Protect owner-stated constraints: " + (ctx.constraints || "none stored"),
          "Use owner-stated budget as a ceiling: " + (ctx.budget || "unknown"),
          "Do the smallest inspectable next step inside this company only.",
        ],
        tradeoffs: [
          "Speed versus evidence. Demand stays unknown.",
          "Adding seats versus using the authorized team.",
        ],
        alreadyKnown: known,
        usedLessons: (ctx.knowledge || []).filter((k) => k.classification === "owner_policy" || k.classification === "correction" || k.classification === "company_fact").map((k) => k.id),
        forbidden: ["outreach", "email", "purchase", "publish", "hire", "policy_rewrite", "cross_workspace"],
      },
    );
  },
  independent_audit(ctx) {
    const teammate = ctx.teammateOutputs || [];
    const blob = JSON.stringify(teammate);
    const flags = [];
    if (/"outreach":\s*true/.test(blob)) flags.push("outreach_flag");
    if (/expectedRevenue|invented demand|"tam":\s*[1-9]/.test(blob)) flags.push("invented_market_flag");
    return labeledOutput(
      "audit_notes",
      "Advisory audit of this workspace's teammate output.",
      {
        flags: flags,
        checks: ["no_outreach", "no_invented_market", "workspace_isolation", "not_autonomous"],
        reviewedCount: teammate.length,
        advisoryOnly: true,
      },
    );
  },
  atlas(ctx) {
    return labeledOutput(
      "fictional_qualification",
      "Fictional/test prospect note. Not outreach. Not a real lead.",
      {
        fictional: true,
        outreach: false,
        input: clip(ctx.input || "No prospect text supplied.", 160),
      },
    );
  },
};

function buildProposedRoles(signals, selection) {
  const unimplemented = ROLE_CATALOG.filter((r) => r.implementationStatus === "not_implemented").map((r) => ({
    roleId: r.roleId,
    roleTitle: r.roleTitle,
    category: r.category,
    selected: false,
    implementationStatus: "not_implemented",
    handlerExists: false,
    willCreate: false,
    reason: "Reserved and unimplemented. Labeled honestly. Not created as a capable employee.",
  }));
  const proposed = [];
  for (const spec of ROLE_CATALOG) {
    if (!selection.roleIds.includes(spec.roleId)) continue;
    const implemented = roleIsImplemented(spec.roleId);
    proposed.push({
      roleId: spec.roleId,
      roleTitle: spec.roleTitle,
      name: spec.name,
      category: spec.category,
      jobDescription: spec.jobDescription,
      objective: spec.defaultObjective,
      selected: true,
      implementationStatus: spec.implementationStatus,
      handlerExists: spec.handlerExists,
      willCreate: implemented,
      createDisposition: implemented ? "will_create" : "proposed_but_not_created",
      reason: selection.reasons[spec.roleId] || "Selected from the workspace objective.",
      liveModelWork: false,
    });
  }
  return { proposed, unimplemented };
}

export function listProductTeams(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const workspaces = ((store.listWorkspaces && store.listWorkspaces()) || []).map((w) => ({
    id: w.id,
    name: w.name,
    intakeKind: w.intakeKind || null,
  }));
  const proposals = ((store.listTeamProposals && store.listTeamProposals(workspaceId)) || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const latest = proposals.length ? proposals[proposals.length - 1] : null;
  const employees = workspaceId
    ? ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((r) => r.teamProposalId)
    : [];
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: TEAM_HONESTY,
    workspaceId: workspaceId || null,
    companies: workspaces,
    proposals: proposals.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      status: p.status,
      selectedRoleIds: p.selectedRoleIds,
      createdEmployeeIds: p.createdEmployeeIds || [],
      createdAt: p.createdAt,
    })),
    latest: latest,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      roleTitle: e.roleTitle,
      status: e.status,
      implementationStatus: e.implementationStatus,
      workspaceId: e.workspaceId,
    })),
    teamGenerated: Boolean(latest && latest.status === "authorized_created"),
    note: workspaceId
      ? "Propose a useful initial team from this company's objective, then authorize Create this team once."
      : "Pick a company, generate a proposed subset, then authorize Create this team once. No silent hire.",
  };
}

export function proposeTeam(store, payload) {
  const workspaceId = payload && (payload.workspaceId || payload.workspace || payload.companyId);
  if (!workspaceId) {
    const err = new Error("A company workspace is required to propose a team.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  const workspace = store.getWorkspace && store.getWorkspace(workspaceId);
  if (!workspace) {
    const err = new Error("company not found");
    err.code = "WORKSPACE_NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const signals = collectWorkspaceSignals(workspace);
  if (payload && payload.ownerObjective) signals.ownerObjective = asText(payload.ownerObjective);
  if (payload && (payload.ownerObjective || payload.constraints)) {
    signals.text = [signals.text, asText(payload.ownerObjective), asText(payload.constraints)].filter(Boolean).join(" \n ");
  }
  const selection = selectRoleIds(signals);
  const built = buildProposedRoles(signals, selection);
  const blob = String(signals.text || "").toLowerCase();
  const softwareLike = /(software|saas|application|platform|codebase|engineer)/i.test(blob);
  const serviceLike = /(service|shop|repair|bakery|neighborhood|storefront|procedure|local services)/i.test(blob);
  const compositionHypothesis = {
    kind: softwareLike && !serviceLike ? "software_like" : (serviceLike && !softwareLike ? "service_like" : (softwareLike && serviceLike ? "mixed" : "generic_service_like")),
    label: "initial team hypothesis",
    note: "Software-like vs service-like heuristic from owner intake. Labeled as an initial team hypothesis, not an approved org chart.",
  };
  const existing = (store.listTeamProposals && store.listTeamProposals(workspaceId)) || [];
  const alreadyCreated = existing.filter((p) => p.status === "authorized_created").slice(-1)[0] || null;
  const proposal = {
    id: nextId(((store.listTeamProposals && store.listTeamProposals()) || []).map((r) => r.id), "TPROP-"),
    workspaceId: workspaceId,
    status: alreadyCreated ? "superseded_by_created_team" : "proposed",
    generator: TEAM_GENERATOR,
    createdAt: nowIso(),
    objectiveText: signals.ownerObjective || null,
    intakeKind: signals.intakeKind,
    compositionHypothesis: compositionHypothesis,
    selectedRoleIds: built.proposed.filter((r) => r.willCreate).map((r) => r.roleId),
    proposedRoles: built.proposed,
    unimplementedRoles: built.unimplemented,
    skippedRoleIds: ROLE_CATALOG.map((r) => r.roleId).filter((id) => !selection.roleIds.includes(id)),
    createdEmployeeIds: alreadyCreated ? alreadyCreated.createdEmployeeIds : [],
    authorized: false,
    authorizedBy: null,
    liveProviderCall: false,
    fixtureLabeledAsLive: false,
    copiesReferenceSpecialistSet: built.proposed.filter((r) => r.willCreate).map((r) => r.roleId).slice().sort().join(",") === REFERENCE_SPECIALIST_ROLE_SET.slice().sort().join(","),
    honesty: TEAM_HONESTY,
    note: alreadyCreated
      ? "A team was already authorized for this company. This proposal is inspectable only. No silent re-hire."
      : "Proposal only. Employees are not created until the owner clicks Create this team.",
  };
  store.putTeamProposal(proposal);
  return {
    ok: true,
    built: true,
    persistence: "FILE_STORE",
    honesty: TEAM_HONESTY,
    liveProviderCall: false,
    employeesCreated: false,
    silentCreate: false,
    proposal: proposal,
    alreadyCreated: Boolean(alreadyCreated),
    company: { id: workspace.id, name: workspace.name },
  };
}

function assertOwnerCreateAuthorization(payload) {
  const actor = asText(payload && payload.actor);
  const confirm = asText(payload && (payload.confirm || payload.action || payload.authorization));
  const explicit = Boolean(
    (payload && payload.authorized === true)
    || (payload && payload.createThisTeam === true)
    || /create this team/i.test(confirm),
  );
  if (actor === "demo_operator") {
    const err = new Error("demo_operator is not local_owner and cannot authorize employee creation.");
    err.code = "DEMO_OPERATOR_FORBIDDEN";
    throw err;
  }
  if (actor === "conductor" || actor === "workflow_manager" || /^conductor-/.test(actor)) {
    const err = new Error("Conductor cannot hire or invent employees without owner authorization.");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  if ((actor !== "owner" && actor !== "local_owner") || !explicit) {
    const err = new Error("Owner authorization is required. A single explicit owner action (Create this team) is the authorization. No silent create.");
    err.code = "OWNER_AUTHORIZATION_REQUIRED";
    throw err;
  }
  return actor;
}

function existingEmployeeForRole(store, workspaceId, roleId) {
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  return roles.find((r) => r.roleId === roleId) || null;
}

function persistEmployee(store, workspace, spec, proposal, actor) {
  const workspaceId = workspace.id;
  const existing = existingEmployeeForRole(store, workspaceId, spec.roleId);
  if (existing) return { employee: existing, created: false, reused: true };
  const now = nowIso();
  const agentId = spec.roleId + "-" + workspaceId;
  const versionId = spec.roleId + "-" + workspaceId + "-v0";
  const empId = nextId(((store.listEmployeeRoles && store.listEmployeeRoles()) || []).map((r) => r.id), "EMP-");
  const allowedTools = Array.from(new Set(SHARED_TOOLS.concat(spec.tools || [])));
  const permissions = {
    outreach: false,
    policyRewrite: false,
    crossWorkspace: false,
    autonomous: false,
    promoted: false,
    budgetBounded: true,
    may: spec.responsibilities || [],
    mayNot: SHARED_PROHIBITIONS.slice(),
  };
  const executionProfile = {
    kind: "deterministic",
    provider: "none",
    model: "deterministic-" + spec.roleId,
    liveModelWork: false,
    implementationStatus: "implemented_basic",
  };
  const knowledgeScope = {
    workspaceId: workspaceId,
    only: true,
    inheritOtherCompanyKnowledge: false,
    inheritOtherCompany: false,
    access: "owner_approved_same_workspace",
  };
  const budget = { spendLimitUsd: 0, currency: "USD", bounded: true, liveSpendAllowed: false };
  const promptBundle = {
    system: spec.jobDescription,
    developer: "Return a labeled deterministic output. Gold is not available at runtime. No outreach. No live model work.",
  };
  const versionPayload = {
    agentId: agentId,
    parentVersionId: null,
    modelProfile: { provider: "none", model: executionProfile.model },
    promptBundle: promptBundle,
    outputSchemaId: "team-employee-basic-v0",
    retrievalPolicy: { enabled: false, workspaceOnly: true },
    allowedTools: allowedTools,
    declaredChange: "Initial immutable freeze for a new-company employee. Not a rewrite of another company version. Not promotion.",
    workspaceId: workspaceId,
    roleId: spec.roleId,
  };
  if (!store.getVersion(versionId)) {
    store.putVersion({
      id: versionId,
      agentId: agentId,
      parentVersionId: null,
      modelProfile: versionPayload.modelProfile,
      promptBundle: promptBundle,
      outputSchema: { "$id": "https://midas.local/schemas/team-employee-basic-v0.json", type: "object" },
      retrievalPolicy: versionPayload.retrievalPolicy,
      curriculumSnapshotId: null,
      allowedTools: allowedTools,
      createdAt: now,
      contentHash: contentHash(versionPayload),
      declaredChange: versionPayload.declaredChange,
      workspaceId: workspaceId,
      roleId: spec.roleId,
      immutable: true,
    });
  }
  if (!store.getAgent(agentId)) {
    store.putAgent({
      id: agentId,
      name: spec.name,
      createdAt: now,
      roleId: spec.roleId,
      roleName: spec.roleTitle,
      workspaceId: workspaceId,
      objective: spec.defaultObjective,
      boundaries: SHARED_PROHIBITIONS.slice(),
      permissions: { may: spec.responsibilities || [], mayNot: SHARED_PROHIBITIONS.slice() },
      versionHistory: [versionId],
      status: TEAM_EMPLOYEE_STATUS,
      approvedKnowledgeAccess: "owner_approved_same_workspace",
      note: TEAM_HONESTY.note,
    });
  }
  const role = {
    id: empId,
    workspaceId: workspaceId,
    teamProposalId: proposal.id,
    requestId: null,
    agentId: agentId,
    roleId: spec.roleId,
    name: spec.name,
    roleTitle: spec.roleTitle,
    jobDescription: spec.jobDescription,
    objective: spec.defaultObjective,
    responsibilities: spec.responsibilities || [],
    prohibitedActions: SHARED_PROHIBITIONS.slice(),
    permissions: permissions,
    knowledgeAccess: "owner_approved_same_workspace",
    knowledgeScope: knowledgeScope,
    tools: allowedTools,
    allowedTools: allowedTools,
    spendLimitUsd: 0,
    budget: budget,
    outputContract: { kind: "labeled_deterministic_output" },
    evalRequirements: [],
    versionId: versionId,
    status: TEAM_EMPLOYEE_STATUS,
    currentStatus: TEAM_EMPLOYEE_STATUS,
    implementationStatus: "implemented_basic",
    executionProfile: executionProfile,
    taskHistory: [],
    promoted: false,
    worldClass: false,
    trusted: false,
    autonomous: false,
    outreach: false,
    unlimitedSpend: false,
    authorizedAt: now,
    authorizedBy: actor,
    createdAt: now,
    disclosure: TEAM_HONESTY.note,
    allowedTaskTypes: (spec.responsibilities || []).concat(["supervised_internal"]),
    allowedSources: ["owner_approved_same_workspace", "workspace_intake", "owner_paste"],
    approvalStatus: "owner_authorized",
    developmentStatus: "implemented_basic",
    selfHiring: false,
  };
  store.putEmployeeRole(role);
  return { employee: role, created: true, reused: false, versionId: versionId };
}

export function runEmployeeTask(store, employeeId, payload) {
  const role = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (!role) {
    const err = new Error("employee not found");
    err.code = "EMPLOYEE_NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const spec = catalogById(role.roleId);
  const handler = ROLE_HANDLERS[role.roleId];
  if (!spec || !spec.handlerExists || !handler) {
    const err = new Error("Role " + role.roleId + " is not_implemented. No capable handler.");
    err.code = "ROLE_NOT_IMPLEMENTED";
    throw err;
  }
  const workspace = store.getWorkspace && store.getWorkspace(role.workspaceId);
  const signals = collectWorkspaceSignals(workspace || { id: role.workspaceId });
  const input = asText(payload && (payload.input || payload.task || payload.text)) || role.objective;
  const output = handler({
    store: store,
    employee: role,
    workspace: workspace,
    objective: asText(payload && payload.ownerText) || signals.ownerObjective || role.objective,
    ownerText: asText(payload && payload.ownerText) || input,
    offer: signals.offer,
    customer: signals.customer,
    budget: signals.budget,
    constraints: signals.constraints,
    procedures: signals.procedures,
    industries: signals.industries,
    description: signals.description,
    skills: signals.skills,
    challenges: signals.challenges,
    knowledge: workspaceKnowledge(store, role.workspaceId, { excludeIds: (payload && payload.excludeKnowledgeIds) || [] }),
    input: input,
    taskKind: asText(payload && (payload.taskKind || payload.type || payload.key)),
    teammateOutputs: (payload && payload.teammateOutputs) || [],
  });
  const now = nowIso();
  const task = {
    id: nextId(((store.listEmployeeTasks && store.listEmployeeTasks()) || []).map((r) => r.id), "ETASK-"),
    workspaceId: role.workspaceId,
    employeeId: role.id,
    agentId: role.agentId,
    roleId: role.roleId,
    createdAt: now,
    input: input,
    status: "completed_deterministic",
    liveProviderCall: false,
    liveModelWork: false,
    output: output,
  };
  store.putEmployeeTask(task);
  const history = (role.taskHistory || []).concat([{
    id: task.id,
    at: now,
    status: task.status,
    kind: output.kind,
    summary: output.summary,
    liveProviderCall: false,
  }]);
  const next = { ...role, taskHistory: history };
  store.putEmployeeRole(next);
  return { ok: true, task: task, employee: next, liveProviderCall: false };
}


export function proposeAdditionalSeats(store, payload) {
  const workspaceId = payload && (payload.workspaceId || payload.workspace || payload.companyId);
  if (!workspaceId) {
    const err = new Error("A company workspace is required to propose additional seats.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  const workspace = store.getWorkspace && store.getWorkspace(workspaceId);
  if (!workspace) {
    const err = new Error("company not found");
    err.code = "WORKSPACE_NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const requested = []
    .concat((payload && payload.roleIds) || [])
    .concat((payload && payload.roles) || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!requested.length) {
    const err = new Error("roleIds are required to propose additional seats.");
    err.code = "ROLE_REQUIRED";
    throw err;
  }
  const existing = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((e) => e && e.workspaceId === workspaceId);
  const existingIds = new Set(existing.map((e) => e.roleId));
  const signals = collectWorkspaceSignals(workspace);
  const selection = { roleIds: requested.filter((id) => !existingIds.has(id)), reasons: {} };
  for (const id of selection.roleIds) selection.reasons[id] = "Owner requested this additional seat after the initial team.";
  const built = buildProposedRoles(signals, selection);
  const proposal = {
    id: nextId(((store.listTeamProposals && store.listTeamProposals()) || []).map((r) => r.id), "TPROP-"),
    workspaceId: workspaceId,
    status: "proposed",
    kind: "additional_seats",
    generator: TEAM_GENERATOR,
    createdAt: nowIso(),
    objectiveText: signals.ownerObjective || null,
    intakeKind: signals.intakeKind,
    selectedRoleIds: built.proposed.filter((r) => r.willCreate).map((r) => r.roleId),
    proposedRoles: built.proposed,
    unimplementedRoles: built.unimplemented,
    createdEmployeeIds: [],
    authorized: false,
    authorizedBy: null,
    liveProviderCall: false,
    fixtureLabeledAsLive: false,
    honesty: TEAM_HONESTY,
    note: "Additional seats only. Existing employees are not re-hired. Employees are not created until the owner clicks Create this team.",
  };
  store.putTeamProposal(proposal);
  return {
    ok: true,
    built: true,
    persistence: "FILE_STORE",
    honesty: TEAM_HONESTY,
    liveProviderCall: false,
    employeesCreated: false,
    silentCreate: false,
    additional: true,
    proposal: proposal,
    company: { id: workspace.id, name: workspace.name },
  };
}

export function createTeam(store, payload) {
  const actor = assertOwnerCreateAuthorization(payload || {});
  let proposal = null;
  if (payload && payload.proposalId) {
    proposal = store.getTeamProposal && store.getTeamProposal(payload.proposalId);
    if (!proposal) {
      const err = new Error("team proposal not found");
      err.code = "PROPOSAL_NOT_FOUND";
      err.errorStatus = 404;
      throw err;
    }
  } else if (payload && (payload.workspaceId || payload.workspace)) {
    const list = (store.listTeamProposals && store.listTeamProposals(payload.workspaceId || payload.workspace)) || [];
    proposal = list.filter((p) => p.status === "proposed").slice(-1)[0] || list.slice(-1)[0] || null;
  }
  if (!proposal) {
    const err = new Error("A proposed team is required before Create this team. Propose first. No silent create.");
    err.code = "PROPOSAL_REQUIRED";
    throw err;
  }
  if (proposal.status === "authorized_created") {
    const employees = (proposal.createdEmployeeIds || []).map((id) => store.getEmployeeRole(id)).filter(Boolean);
    return {
      ok: true,
      alreadyCreated: true,
      liveProviderCall: false,
      proposal: proposal,
      employees: employees,
      createdEmployeeIds: proposal.createdEmployeeIds,
      honesty: TEAM_HONESTY,
    };
  }
  const workspace = store.getWorkspace && store.getWorkspace(proposal.workspaceId);
  if (!workspace) {
    const err = new Error("company not found");
    err.errorStatus = 404;
    throw err;
  }
  const denied = new Set(
    []
      .concat(payload && payload.deniedRoleIds || [])
      .concat(payload && payload.denyRoleIds || [])
      .concat(payload && payload.deniedRoles || [])
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
  const created = [];
  const skipped = [];
  const deniedRows = [];
  for (const row of proposal.proposedRoles || []) {
    if (denied.has(row.roleId)) {
      deniedRows.push({ roleId: row.roleId, disposition: "denied_by_owner", reason: "Owner denied this role in the authorize step." });
      skipped.push({ roleId: row.roleId, implementationStatus: row.implementationStatus, disposition: "denied_by_owner", reason: "Owner denied this role in the authorize step." });
      continue;
    }
    const spec = catalogById(row.roleId);
    if (!spec || !roleIsImplemented(row.roleId)) {
      skipped.push({
        roleId: row.roleId,
        implementationStatus: (spec && spec.implementationStatus) || "not_implemented",
        disposition: "proposed_but_not_created",
        reason: "No basic task handler. Not persisted as a capable employee.",
      });
      continue;
    }
    const out = persistEmployee(store, workspace, spec, proposal, actor);
    created.push(out.employee);
    if (out.created) {
      runEmployeeTask(store, out.employee.id, {
        input: "Authorized orientation for " + spec.roleTitle + " on " + workspace.id,
      });
    }
  }
  const createdIds = created.map((e) => e.id);
  const nextProposal = {
    ...proposal,
    status: "authorized_created",
    authorized: true,
    authorizedBy: actor,
    authorizedAt: nowIso(),
    createdEmployeeIds: createdIds,
    skippedUnimplemented: skipped,
    deniedRoleIds: Array.from(denied),
    deniedRoles: deniedRows,
    note: "Owner authorized Create this team once. Individual roles can be denied. Employees persist on this workspace only. No self-hiring.",
  };
  store.putTeamProposal(nextProposal);
  store.putWorkspace({
    ...workspace,
    teamGenerated: true,
    teamProposalId: nextProposal.id,
    updatedAt: nowIso(),
  });
  return {
    ok: true,
    built: true,
    persistence: "FILE_STORE",
    honesty: TEAM_HONESTY,
    liveProviderCall: false,
    alreadyCreated: false,
    authorizedBy: actor,
    proposal: nextProposal,
    employees: createdIds.map((id) => store.getEmployeeRole(id)),
    createdEmployeeIds: createdIds,
    skippedUnimplemented: skipped,
    company: { id: workspace.id, name: workspace.name },
    note: "Created " + createdIds.length + " real employees on " + workspace.id + ". Not autonomous. No outreach.",
  };
}

export function inspectTeamProposal(store, id) {
  const proposal = store.getTeamProposal && store.getTeamProposal(id);
  if (!proposal) return { errorStatus: 404, error: "team proposal not found" };
  const employees = (proposal.createdEmployeeIds || []).map((eid) => store.getEmployeeRole(eid)).filter(Boolean);
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: TEAM_HONESTY,
    proposal: proposal,
    employees: employees,
  };
}

export function enrichPersistedEmployee(store, emp) {
  if (!emp) return emp;
  const spec = catalogById(emp.roleId) || {};
  const next = {
    ...emp,
    allowedTaskTypes: Array.isArray(emp.allowedTaskTypes) ? emp.allowedTaskTypes : (spec.responsibilities || []).concat(["supervised_internal"]),
    allowedSources: Array.isArray(emp.allowedSources) ? emp.allowedSources : ["owner_approved_same_workspace", "workspace_intake", "owner_paste"],
    approvalStatus: emp.approvalStatus || "owner_authorized",
    developmentStatus: emp.developmentStatus || emp.implementationStatus || "implemented_basic",
    selfHiring: false,
  };
  if (store.putEmployeeRole) store.putEmployeeRole(next);
  return next;
}
