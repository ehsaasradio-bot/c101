# Backlog

## Status — tier one is complete (2026-07-31)

All 39 below are shipped. 38 are their own pages; `future-value` is a mode
inside `present-value-calculator` rather than a page of its own, which is what
the note under Financial recommended. The registry holds **89** calculators.

Ten more shipped past tier one, in the batch that closed it out:

| | |
|---|---|
| Financial | `car-lease` · `mortgage-points` · `capital-gains` |
| Health | `ovulation` · `calories-burned` · `caloric-deficit` |
| Math | `confidence-interval` · `half-life` |
| Everyday | `ohms-law` · `time-card` |

Each was linked in from an existing neighbour rather than left orphaned —
`auto-loan`→`car-lease`, `mortgage`→`mortgage-points`, `income-tax`→
`capital-gains`, `due-date`→`ovulation`, `tdee`→both calorie pages,
`z-score`→`confidence-interval`, `logarithm`→`half-life`,
`electricity-cost`→`ohms-law`, `salary`→`time-card`.

**Known gap, not yet fixed:** `body-surface-area` refuses newborn heights while
listing Haycock — the formula whose whole point is paediatric dosing — and an FAQ
on that page still quotes 0.25 m² for a newborn. The fix is a separate length
input, not a lower floor on the existing one.

What is left is the ~80 long-tail slugs described under *Deliberately excluded*,
so the next batch is a judgement call about which search terms to chase rather
than a queue to work through.

---

39 calculators worth building, derived from a gap analysis against
[aifi2k02/calculators101](https://github.com/aifi2k02/calculators101) on
2026-07-30. We had 41; their registry listed 191; 160 slugs were missing.

**This is not a parity list.** Of those 160, roughly 15 were renames of things we
already have (`lcm-gcd` is our `gcd-lcm` reversed, `calorie` is our `tdee`,
`percent-off` is our `discount`, `gas-mileage` is our `fuel-cost`). Another ~20
were excluded on judgement, and ~80 more are legitimate but narrow long-tail.
What remains below is the set with real maths behind it and real demand in front
of it.

Each one is four files and a registry line — use the `caly` skill.

## Financial (15)

`amortization` · `refinance` · `income-tax` · `paycheck` · `401k` · `roth-ira` ·
`debt-payoff` · `budget` · `rent-vs-buy` · `down-payment` · `apr` ·
`simple-interest` · `present-value` · `future-value` · `npv`

Notes:
- **amortization** is not a duplicate of `mortgage-calculator`. That one answers
  "what is the payment"; this one is the schedule — the per-period split of
  principal and interest, which is a table plus a series rather than a headline.
- **paycheck** overlaps `salary-calculator`, which converts between pay periods.
  This is take-home after tax and deductions. Keep the boundary explicit in the
  copy or the two will cannibalise each other.
- **debt-payoff** overlaps `credit-card-payoff-calculator` (single balance).
  This is multi-debt snowball vs avalanche — worth building precisely because
  the comparison is the answer.
- **present-value / future-value** are two directions of one formula. Consider
  one calculator with a mode select, the way `percentage-calculator` does it,
  rather than two thin pages.

## Health & Fitness (5)

`due-date` · `waist-hip` · `vo2max` · `body-surface-area` · `lean-body-mass`

Notes:
- **lean-body-mass** overlaps `body-fat-calculator`, which already implies it.
  Only worth a page if it carries the Boer/James/Hume formulas explicitly and
  compares them.
- **body-surface-area** has several competing formulas (Du Bois, Mosteller,
  Haycock). Name whichever you implement, and prefer showing more than one.

## Math (12)

`area` · `volume` · `probability` · `square-root` · `exponent` · `logarithm` ·
`slope` · `distance` · `z-score` · `prime` · `factorial` · `combination`

Notes:
- **area** subsumes their separate `square-footage`. One calculator with a shape
  select beats two pages.
- **combination** should cover permutations too — nCr and nPr are the same page.

## Everyday (7)

`gpa` · `grade` · `paint` · `concrete` · `tile` · `business-days` ·
`time-zone-converter`

Notes:
- **business-days** overlaps `date-difference-calculator`. The distinguishing
  feature is holiday handling; without that it is a thin variant.
- **paint / concrete / tile** are the same shape — area or volume, a coverage
  rate, and a waste factor. Build one well and the other two follow quickly.

## Deliberately excluded

**Already covered, despite the slug gap.** Their `mean-median-mode` and
`standard-deviation` are both inside our `average-calculator`, which already
reports median, mode, range, and population *and* sample standard deviation.
Their `protein` is inside our `macro-calculator`. Splitting these out would be
SEO surface at the cost of making the good calculator look thinner.

**Not calculators.** `base64`, `url-encode`, `hash`, `password`, `word-count`,
`color-converter`. These are developer utilities. This site's promise is that it
shows its working; a base64 encode has no working to show.

**No defensible working.** `love`, `zodiac`, `numerology`, `dog-age`, `pizza`,
`shoe-size`. They draw traffic. They also make every neighbouring page less
credible, and there is no honest "how this is calculated" panel to write.

**Long tail, build only if chasing specific search terms.** `nurse-pay`,
`creator-tax`, `wedding-budget`, `mulch`, `roof-pitch`, `coast-fire`,
`side-hustle`, and roughly 75 similar.

## What we have that they do not

`savings-goal` · `heart-rate-zone` · `right-triangle` · `cooking-converter` ·
`percentage-change` · `gcd-lcm` · `credit-card-payoff` · `date-difference` ·
`electricity-cost` · `running-pace`
