src = open('/tmp/base.mjs', encoding='utf-8').read()

src = src.replace('''/**
 * Promotion gate for the taxonomy repair: oq-v1-schema2 against the incumbent
 * oq-v1.''', '''/**
 * Promotion gate for the combined repair: oq-v2 (the new code plus the policy
 * that governs it) against the production incumbent oq-v1.
 *
 * This is the third gate on related material, so the reason it is not gate
 * shopping has to be stated plainly. Two earlier experiments asked two different
 * questions, and both answers stand unchanged:
 *
 *   A. Does the expiry knowledge add aggregate value over a control that already
 *      has the code? No: 1.74 against a declared 3.0. oq-v2 was not promoted.
 *   B. Is the bare code change strictly preferable to the incumbent? No: it
 *      over-applies the code it gained, declaring an opportunity closing
 *      tomorrow expired in two of three trials.
 *
 * B produced information that did not exist when A was designed -- that
 * over-application is a real failure mode, and that the knowledge is what
 * suppresses it. That makes "code plus knowledge against the incumbent" a
 * comparison neither experiment ran, and it is the actual production question,
 * which neither A nor B was.
 *
 * Criteria are repair-type for the same reason the taxonomy gate's were: this
 * change is asked to fix a defect without introducing one, not to raise an
 * aggregate it was never aimed at. Both arms run fresh; no number from the
 * earlier runs is reused.''', 1)

src = src.replace('export const TAXONOMY_PROMOTION_CRITERIA = {\n  kind: "structural_repair",',
                  'export const COMBINED_PROMOTION_CRITERIA = {\n  kind: "structural_repair_plus_governing_policy",', 1)
src = src.replace('TAXONOMY_PROMOTION_CRITERIA', 'COMBINED_PROMOTION_CRITERIA')

src = src.replace('  QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID,\n} from "../packages/eval/src/qualifier-foundry.ts";',
                  '  QUALIFIER_V1_ID, QUALIFIER_V2_ID,\n} from "../packages/eval/src/qualifier-foundry.ts";', 1)
src = src.replace('QUALIFIER_V1_SCHEMA2_ID', 'QUALIFIER_V2_ID')

src = src.replace('"qualifier-promotion-taxonomy.json"', '"qualifier-promotion-combined.json"')
src = src.replace('id: "PROMO-OQ-TAXONOMY-V2"', 'id: "PROMO-OQ-V2-COMBINED"')
src = src.replace('note: "Structural repair to the output contract. Promoted on non-inferiority off-target plus a verified repair on-target and on the real records that exposed the defect. No aggregate score gain was required, and none should be read into this.",',
                  'note: "Combined repair: the new output code plus the policy governing when it applies. Promoted on repair criteria, not aggregate gain. The earlier finding that this knowledge adds little aggregate value stands; its value here is suppressing over-application of the code.",')
src = src.replace('"taxonomy gate trial "', '"combined gate trial "')
src = src.replace('=== TAXONOMY PROMOTION: oq-v1-schema2 vs oq-v1 ===', '=== COMBINED PROMOTION: oq-v2 vs oq-v1 ===')
src = src.replace('  note: "A structural repair is judged on whether it fixes its target, holds across trials, costs nothing on unrelated cases, and reproduces on the real records that exposed the defect. An aggregate score gain is not required and is not evidence of a good contract repair.",',
                  '  note: "Judged on whether the combined change fixes the defect, does not over-apply the code it introduces, costs nothing on unrelated cases, holds across trials, and reproduces on the real records. Aggregate gain is not a criterion.",')
src = src.replace('DECISION:", promote ? "PROMOTE oq-v1-schema2"', 'DECISION:", promote ? "PROMOTE oq-v2"')

assert 'COMBINED_PROMOTION_CRITERIA' in src
assert 'QUALIFIER_V1_SCHEMA2_ID' not in src
open('tools/qualifier-promote-combined.mjs', 'w', encoding='utf-8', newline='\n').write(src)
print('written')
