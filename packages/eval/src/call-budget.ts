/**
 * A budget that refuses rather than a budget that is hoped for.
 *
 * Last mission planned six cases across two arms as twelve calls. Multi-step
 * reading costs two to three calls per case, so the control arm alone consumed
 * the entire ceiling and the treatment arm never ran. The plan was wrong before
 * a single call was made and nothing checked it.
 *
 * So the worst case is computed from turns rather than from cases, and execution
 * is refused when the declared maximum exceeds the ceiling. A budget that can
 * only be exceeded by editing the declaration is a budget.
 */
export interface BudgetLine {
  label: string;
  cases: number;
  arms: number;
  /** Maximum model turns per case-arm. One for a single-shot decision. */
  maxTurns: number;
  model: string;
}

export function planCalls(lines: BudgetLine[], ceiling: number, perModelCeilings: Record<string, number> = {}) {
  const byModel: Record<string, number> = {};
  let max = 0;
  for (const l of lines) {
    const worst = l.cases * l.arms * l.maxTurns;
    max += worst;
    byModel[l.model] = (byModel[l.model] || 0) + worst;
  }
  const violations: string[] = [];
  if (max > ceiling) violations.push("declared maximum " + max + " exceeds the mission ceiling of " + ceiling);
  for (const [model, cap] of Object.entries(perModelCeilings)) {
    if ((byModel[model] || 0) > cap) violations.push(model + " maximum " + byModel[model] + " exceeds its ceiling of " + cap);
  }
  return { max, byModel, ceiling, perModelCeilings, ok: violations.length === 0, violations, lines };
}

/** A live counter that throws rather than quietly overspending. */
export function budgetGuard(ceiling: number, perModelCeilings: Record<string, number> = {}) {
  const spent: Record<string, number> = {};
  let total = 0;
  return {
    charge(model: string) {
      const next = (spent[model] || 0) + 1;
      const cap = perModelCeilings[model];
      if (cap !== undefined && next > cap) throw new Error("budget: " + model + " ceiling of " + cap + " reached");
      if (total + 1 > ceiling) throw new Error("budget: mission ceiling of " + ceiling + " reached");
      spent[model] = next; total += 1;
      return { total, spent: { ...spent } };
    },
    remaining: () => ceiling - total,
    remainingFor: (model: string) => (perModelCeilings[model] === undefined ? ceiling - total : perModelCeilings[model] - (spent[model] || 0)),
    total: () => total,
    spent: () => ({ ...spent }),
  };
}
