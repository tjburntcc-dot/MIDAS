/**
 * Future PostgreSQL / Drizzle contract. Not imported at runtime.
 * Persistence in this slice is FILE_STORE only. Never claim PostgreSQL is connected.
 *
 * Planned tables (comment contract only):
 * - agents(id, name, created_at)
 * - agent_versions(id, agent_id, parent_version_id, model_profile, prompt_bundle,
 *     output_schema, retrieval_policy, curriculum_snapshot_id, allowed_tools,
 *     created_at, content_hash, declared_change)  -- versions are immutable
 * - eval_runs(id, agent_version_id, suite_version, arm, trial_index, status, created_at, completed_at)
 * - case_results(id, eval_run_id, case_id, weighted_total, dimensions, critical_failures,
 *     assessments, citations, missing_information, latency_ms, error, responder_kind)
 * - decisions(id, eval_run_id, kind, rationale, created_at)
 * - knowledge_items(id, type, statement, source_id, source_sha256, locator, claim_kind, accepted, created_at)
 * - sources(id, url, title, publisher, retrieved_at, content_type, sha256, byte_length, parser_version, capture_status)
 * - curriculum_snapshots(id, source_ids, source_sha256s, knowledge_item_ids, content_hash, created_at)
 * - workspaces(id, name, description, industry, type, offer, ideal_customer, geography, goal, constraints, owner_status)
 * - training_events(id, workspace_id, agent_id, prev_version_id, new_version_id, review_status) -- created != promoted
 * - workbench_runs, owner_review_labels (never runtime input), workspace_notes (private, not retrieved)
 *
 * Do not import drizzle-orm from this file. FILE_STORE is the running persistence.
 */
export const FUTURE_PG_CONTRACT = {
  kind: "documentation_only",
  note: "Drizzle schema is a future PostgreSQL contract. FILE_STORE is the running persistence. PostgreSQL is not connected.",
} as const;
