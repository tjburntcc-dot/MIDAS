# Where routing still fails

Written after the routing foundry cycle rejected both the declared candidate and
the increment. Sealed set `276a8ca10309027a`, 20 cases, four per routing outcome.

## What the cycle actually showed

| | routing | false accept | false decline | false hold | qualified an aggregate | unknown-count routing | qualify recall |
|---|---|---|---|---|---|---|---|
| A incumbent (promoted contract) | 0.25 | 0.55 | 0.05 | 0.15 | 3 | 0.33 | 0.75 |
| B candidate (schema only) | 0.50 | 0.20 | 0.15 | 0.00 | 3 | 0.00 | 1.00 |
| C increment (schema + policy) | 0.80 | 0.00 | 0.05 | 0.05 | 0 | 1.00 | 0.75 |

The first thing to record is that the schema-only configuration did not
generalize. On the identity sealed set it routed at 0.8 with zero
cardinality-blindness. On a set balanced across all five outcomes it routes at
0.5 and qualifies three aggregates as single opportunities. The number that made
it look like the answer last cycle was a property of that set, not of the
configuration. Promoting it post-hoc, which the previous mission refused to do,
would have promoted a configuration that fails its own gate by four checks.

The second is that the routing policy works and still did not earn promotion.
It closed the gap it was aimed at exactly: unknown-count routing 0.00 to 1.00,
cardinality-blindness 3 to 0, false accepts 0.20 to 0.00, and it is the only arm
where the previously unstable production shape is stable and correct. It failed
one declared check -- qualify recall fell from 4/4 to 3/4 -- and the criterion
was frozen before running, so it is rejected.

That criterion is coarse. Four qualify cases means the smallest possible
regression is 0.25, so the gate cannot distinguish "slightly more cautious" from
"broken". That is a defect in the evaluation design, not a reason to override the
result. The next declared cycle needs enough qualify cases for the gate to have
resolution, and the threshold must be set before that set is run.

## The three residual failures, localized

Four of C's twenty cases were wrong. They are not four instances of one problem.

### 1. Counterparty selection (RSEAL-03) -- the one that broke the gate

A staffing firm engages a contractor for an unnamed insurance client, invoices
fortnightly, discloses the client after signature. C classified it
`single_opportunity` rather than `intermediary_record` and held for identity.

The routing rule it applied was correct: a piece of work whose counterparty is
not established should be researched. It picked the wrong entity as the
counterparty. The staffing firm signs and pays; the insurance client's anonymity
is irrelevant to whether we can transact. This is not a routing defect at all --
routing was downstream and consistent. It is a failure to answer "who is the
party we would contract with" before asking "is that party established".

Worth noting the incumbent got this case right, by accident: with no identity
vocabulary it simply decided to pursue.

### 2. Items counted without asking whether any item is work (RSEAL-13, -19, -20)

Three of four errors sit on one axis, and it is the same axis as the only
unstable case in either arm.

- RSEAL-20, a showcase of twelve freelancer profiles: C returned
  `aggregate_listing`, count 12, `decompose`. Twelve sellers is not twelve
  opportunities.
- RSEAL-19, forty-one articles matching a search: routed `decompose`, `decline`,
  `decompose` across three repeats. The one genuinely unstable case in both arms.
- RSEAL-13, a marketplace describing itself: routed `decompose`, treating a venue
  as a container to break open rather than a place to return to.

The policy's closing sentence states this rule explicitly -- a page of many items
with no work in it is declined -- and the worker still counted first. The
plurality signal is stronger than the commerciality signal, and stating the rule
in prose did not reverse the ordering. Both no-identity and identity arms make
this error, so it is not a contract defect.

The distinction the worker is missing is one question asked before counting: *is
any single item on this page a thing a buyer wants done?* Twelve profiles, forty-
one articles and a marketplace's front page all answer no, and all three of them
have a large obvious count sitting on the surface of the record.

### 3. A defect in my own policy text (RSEAL-16)

A peer agency's own services page. Both arms declined it; the gold keeps it as a
discovery source.

Two clauses of the policy match this record. "A record holding no work but naming
real organisations: keep it as a place to look" and "a record in which no party
is buying anything: decline it" are both true of a company page, and the policy
gives no precedence between them. The worker is not wrong to have picked one; the
text does not say which wins.

This is mine to fix, and it should be fixed as a stated precedence rather than by
adding a case, because the next ambiguous pair will not be a company page.

## What this means for the next cycle

The increment is the right shape and is not promotable as written. Three specific
changes, all to be declared before running rather than tuned against this set:

1. A counterparty-selection step ahead of routing: name the party that would sign
   and pay, before judging whether identity is established.
2. Commerciality before cardinality: ask whether any single item is work before
   counting items.
3. Explicit precedence in the policy text when a record matches both the
   keep-as-source clause and the decline clause.

None of these is a case pattern and none mentions a record in either set.
