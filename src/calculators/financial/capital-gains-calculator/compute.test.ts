import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { bySlug } from '../../index'
import { CalcError } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

// Deliberately NOT `as const`: pinning the literals would make
// `Partial<typeof base>` reject `{ salePrice: 60_000 }`.
const base: Input = {
  salePrice: 50_000,
  costBasis: 30_000,
  sellingCosts: 500,
  holdingDays: 548,
  filingStatus: 'single',
  otherIncome: 85_000,
}

const run = (patch: Partial<Input> = {}) => compute({ ...base, ...patch })
const tax = (patch: Partial<Input> = {}) => Number(run(patch).primary.value)
const stat = (patch: Partial<Input>, label: string) =>
  Number(run(patch).stats!.find((s) => s.label.startsWith(label))!.value)

const shortTermTax = (patch: Partial<Input> = {}) => stat(patch, 'Tax if short-term')
const longTermTax = (patch: Partial<Input> = {}) => stat(patch, 'Tax if long-term')

/*
 * ─── The outside world's own numbers ──────────────────────────────────────
 *
 * Everything below is transcribed from IRS Revenue Procedure 2025-32
 * (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), read as the IRS published
 * it. These are evidence rather than a restatement of the formula: a threshold
 * typed one digit out, or a stacking rule that taxes the whole gain at the top
 * rate, fails here even though every self-consistent check would pass.
 */

/** Section 4.14(1) — 2026 standard deduction. */
const STD: Record<string, number> = {
  single: 16_100,
  married: 32_200,
  marriedSeparate: 16_100,
  headOfHousehold: 24_150,
}

/** Section 4.03 — "Maximum Zero Rate Amount" and "Maximum 15% Rate Amount". */
const LTCG: Record<string, { zeroTop: number; fifteenTop: number }> = {
  // "Married Individuals Filing Joint Returns and Surviving Spouse"
  married: { zeroTop: 98_900, fifteenTop: 613_700 },
  // "Married Individuals Filing Separate Returns"
  marriedSeparate: { zeroTop: 49_450, fifteenTop: 306_850 },
  // "Heads of Household"
  headOfHousehold: { zeroTop: 66_200, fifteenTop: 579_600 },
  // "All Other Individuals"
  single: { zeroTop: 49_450, fifteenTop: 545_500 },
}

/**
 * Section 4.01 tables 1-4, restated as the cumulative "plus" constants the IRS
 * prints: [top of band in taxable income, tax due at that point]. Quoted
 * verbatim, so a bracket table transcribed one row out of alignment fails.
 */
const IRS_CUMULATIVE: Record<string, ReadonlyArray<readonly [number, number]>> = {
  // Table 3 — Unmarried Individuals.
  single: [
    [12_400, 1_240],
    [50_400, 5_800],
    [105_700, 17_966],
    [201_775, 41_024],
    [256_225, 58_448],
    [640_600, 192_979.25],
  ],
  // Table 1 — Married Individuals Filing Joint Returns and Surviving Spouses.
  married: [
    [24_800, 2_480],
    [100_800, 11_600],
    [211_400, 35_932],
    [403_550, 82_048],
    [512_450, 116_896],
    [768_700, 206_583.5],
  ],
  // Table 4 — Married Individuals Filing Separate Returns.
  marriedSeparate: [
    [12_400, 1_240],
    [50_400, 5_800],
    [105_700, 17_966],
    [201_775, 41_024],
    [256_225, 58_448],
    [384_350, 103_291.75],
  ],
  // Table 2 — Heads of Households.
  headOfHousehold: [
    [17_700, 1_770],
    [67_450, 7_740],
    [105_700, 16_155],
    [201_750, 39_207],
    [256_200, 56_631],
    [640_600, 191_171],
  ],
}

/** The top of the 12% band, which is where the one LT-above-ST window lives. */
const TWELVE_TOP: Record<string, number> = {
  single: 50_400,
  married: 100_800,
  marriedSeparate: 50_400,
  headOfHousehold: 67_450,
}

const STATUSES = Object.keys(STD)

/**
 * A form state producing exactly `gain`, with other income set so that ordinary
 * taxable income is exactly `taxableOther`. Setting `otherIncome` to the
 * standard deduction gives a clean zero baseline: no ordinary tax, nothing
 * stacked under the gain, so the figure that comes back is the rate table alone.
 */
const sale = (gain: number, status: string, taxableOther = 0): Partial<Input> => ({
  salePrice: Math.max(0, gain),
  costBasis: Math.max(0, -gain),
  sellingCosts: 0,
  filingStatus: status,
  otherIncome: STD[status]! + taxableOther,
})

const LONG = { holdingDays: 548 }
const SHORT = { holdingDays: 365 }

describe('capital gains — the defaults', () => {
  /*
   * DERIVATION, by hand, for the defaults: single, $85,000 of other income,
   * sold for $50,000 with a $30,000 basis and $500 of selling costs, held 548
   * days.
   *
   *   net proceeds          50,000 − 500          = 49,500
   *   net capital gain      49,500 − 30,000       = 19,500
   *   ordinary taxable      85,000 − 16,100 (std) = 68,900
   *   taxable with the sale 68,900 + 19,500       = 88,400
   *
   * SHORT-TERM, first way — the IRS cumulative constants from table 3:
   *   tax on 88,400 = 5,800 + 22% × (88,400 − 50,400) = 5,800 + 8,360 = 14,160
   *   tax on 68,900 = 5,800 + 22% × (68,900 − 50,400) = 5,800 + 4,070 =  9,870
   *   difference                                                      =  4,290
   *
   * SHORT-TERM, second and independent way — the whole stacked range
   * 68,900 → 88,400 sits inside the single filer's 22% band (50,400 →
   * 105,700), so no bracket is crossed and the gain is taxed flat:
   *   19,500 × 22% = 4,290.  Agrees.
   *
   * LONG-TERM, first way — § 1(h) stacking. The gain sits from 68,900 to
   * 88,400, entirely above the $49,450 maximum zero rate amount and entirely
   * below the $545,500 maximum 15% rate amount, so all of it meets 15%:
   *   at 0%: 0     at 15%: 19,500     at 20%: 0
   *   19,500 × 15% = 2,925
   *
   * LONG-TERM, second and independent way — total tax on the whole return minus
   * total tax without the sale, computed from the constants:
   *   ordinary part 68,900 → 9,870 (above), plus 2,925 of capital tax = 12,795
   *   without the sale                                                =  9,870
   *   difference                                                      =  2,925.  Agrees.
   *
   * The point of the page: 4,290 − 2,925 = 1,365 saved by holding past a year.
   */
  test('headline is the long-term bill, $2,925', () => {
    expect(tax()).toBeCloseTo(2_925, 6)
    expect(run().primary.label).toBe('Federal capital gains tax')
  })

  test('short-term confirms two independent ways', () => {
    const fromConstants = 5_800 + 0.22 * (88_400 - 50_400) - (5_800 + 0.22 * (68_900 - 50_400))
    const fromFlatBand = 19_500 * 0.22
    expect(fromConstants).toBeCloseTo(4_290, 6)
    expect(fromFlatBand).toBeCloseTo(4_290, 6)
    expect(shortTermTax()).toBeCloseTo(4_290, 6)
  })

  test('long-term confirms two independent ways', () => {
    expect(19_500 * 0.15).toBeCloseTo(2_925, 6)
    expect(9_870 + 2_925 - 9_870).toBeCloseTo(2_925, 6)
    expect(longTermTax()).toBeCloseTo(2_925, 6)
  })

  test('reports the saving from holding past a year', () => {
    expect(stat({}, 'Saved by holding past one year')).toBeCloseTo(1_365, 6)
    expect(stat({}, 'Net capital gain')).toBeCloseTo(19_500, 6)
    expect(stat({}, 'Effective rate on the gain')).toBeCloseTo(15, 6)
    expect(stat({}, 'Profit kept after tax')).toBeCloseTo(19_500 - 2_925, 6)
  })

  test('both bills are shown whatever the holding period entered', () => {
    for (const days of [1, 200, 365, 366, 548, 14_600]) {
      const stats = run({ holdingDays: days }).stats!
      expect(stats.some((s) => s.label.startsWith('Tax if short-term'))).toBe(true)
      expect(stats.some((s) => s.label.startsWith('Tax if long-term'))).toBe(true)
    }
  })

  test('the 365-day line is a cliff, and it is one day wide', () => {
    expect(tax({ holdingDays: 365 })).toBeCloseTo(4_290, 6)
    expect(tax({ holdingDays: 366 })).toBeCloseTo(2_925, 6)
    // Nothing else about the two results differs.
    expect(shortTermTax({ holdingDays: 365 })).toBeCloseTo(shortTermTax({ holdingDays: 366 }), 6)
  })

  test('the e2e nudge of the first number field gives a valid, different answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('salePrice')
    const nudged = tax({ salePrice: base.salePrice * 1.1 })
    expect(Number.isFinite(nudged)).toBe(true)
    expect(nudged).not.toBeCloseTo(tax(), 6)
    // 55,000 − 500 − 30,000 = 24,500 of gain, still entirely in the 15% band.
    expect(nudged).toBeCloseTo(24_500 * 0.15, 6)
  })
})

describe('capital gains — the IRS tables themselves', () => {
  /*
   * A short-term gain IS ordinary income, so a gain stacked on a zero baseline
   * must reproduce the IRS's own published cumulative tax at every band top.
   * Eighteen of these constants are shared verbatim with
   * `financial/income-tax-calculator`, which is what keeps the two files from
   * drifting apart on the ordinary bands.
   */
  test.each(STATUSES)('%s short-term gains reproduce the published tax at every band top', (s) => {
    for (const [bandTop, published] of IRS_CUMULATIVE[s]!) {
      expect(shortTermTax({ ...sale(bandTop, s), ...SHORT }), `${s} @ ${bandTop}`).toBeCloseTo(
        published,
        6,
      )
    }
  })

  test.each(STATUSES)('%s long-term rate thresholds are exact, on both sides', (s) => {
    const { zeroTop, fifteenTop } = LTCG[s]!
    const lt = (gain: number) => longTermTax({ ...sale(gain, s), ...LONG })

    // The maximum ZERO rate amount is inclusive: a gain of exactly that size,
    // with nothing stacked under it, is taxed at nothing at all.
    expect(lt(zeroTop - 1), `${s} just under the 0% top`).toBeCloseTo(0, 6)
    expect(lt(zeroTop), `${s} exactly at the 0% top`).toBeCloseTo(0, 6)
    expect(lt(zeroTop + 1), `${s} one dollar over`).toBeCloseTo(0.15, 6)
    expect(lt(zeroTop + 1_000), `${s} a thousand over`).toBeCloseTo(150, 6)

    // The maximum 15% rate amount, likewise inclusive.
    const fullFifteen = (fifteenTop - zeroTop) * 0.15
    expect(lt(fifteenTop - 1), `${s} just under the 15% top`).toBeCloseTo(fullFifteen - 0.15, 6)
    expect(lt(fifteenTop), `${s} exactly at the 15% top`).toBeCloseTo(fullFifteen, 6)
    expect(lt(fifteenTop + 1), `${s} one dollar over`).toBeCloseTo(fullFifteen + 0.2, 6)
    expect(lt(fifteenTop + 100_000), `${s} well over`).toBeCloseTo(fullFifteen + 20_000, 6)
  })

  test.each(STATUSES)('%s thresholds are read off TOTAL taxable income, not the gain', (s) => {
    const { zeroTop } = LTCG[s]!
    // Ordinary income fills the brackets first, so a gain that would be free of
    // tax on its own is pushed into the 15% band by the income under it.
    expect(longTermTax({ ...sale(1_000, s, 0), ...LONG })).toBeCloseTo(0, 6)
    expect(longTermTax({ ...sale(1_000, s, zeroTop), ...LONG })).toBeCloseTo(150, 6)
    // Straddling the line: half below the 0% top, half above it.
    expect(longTermTax({ ...sale(1_000, s, zeroTop - 400), ...LONG })).toBeCloseTo(600 * 0.15, 6)
  })

  test('the standard deduction shields a gain when there is no other income', () => {
    // No other income at all: the $16,100 single standard deduction eats the
    // first $16,100 of the gain before any rate is reached.
    const g = 20_000
    const r = run({ salePrice: g, costBasis: 0, sellingCosts: 0, otherIncome: 0, ...LONG })
    // Taxable income is 20,000 − 16,100 = 3,900, well inside the 0% band.
    expect(Number(r.primary.value)).toBeCloseTo(0, 6)
    // And short-term it is 10% of that 3,900, not 10% of the whole 20,000.
    expect(Number(r.stats!.find((s) => s.label.startsWith('Tax if short-term'))!.value)).toBeCloseTo(
      390,
      6,
    )
  })
})

describe('capital gains — long-term is (almost always) cheaper', () => {
  const GAINS = [0, 1, 500, 950, 1_250, 1_900, 5_000, 25_000, 60_000, 200_000, 545_500, 900_000]

  /**
   * Incomes chosen RELATIVE to each status's own thresholds, so the sweep
   * actually lands on the awkward places rather than wherever a shared list of
   * round numbers happens to fall. Sitting exactly on the maximum zero rate
   * amount is the case that exposes the 12%-versus-15% overlap; a flat list of
   * incomes missed it entirely and the guard below was dead code.
   */
  const incomesFor = (s: string) => {
    const ded = STD[s]!
    const { zeroTop, fifteenTop } = LTCG[s]!
    return [
      0,
      ded,
      ded + 10_000,
      ded + zeroTop - 400,
      ded + zeroTop,
      ded + TWELVE_TOP[s]!,
      ded + zeroTop + 30_000,
      ded + fifteenTop - 5_000,
      ded + fifteenTop + 200_000,
    ]
  }

  test(
    'a long-term gain is never taxed more than the same gain short-term',
    () => {
      let checked = 0
      const violations: Array<{ where: string; excess: number; gain: number }> = []

      for (const s of STATUSES) {
        const ded = STD[s]!
        for (const otherIncome of incomesFor(s)) {
          for (const gain of GAINS) {
            const v = { ...sale(gain, s), otherIncome }
            const st = shortTermTax({ ...v, ...SHORT })
            const lt = longTermTax({ ...v, ...LONG })
            checked++

            // The one documented window: the 0% band stops BELOW the top of the
            // ordinary 12% bracket, so a gain landing in that strip meets 15%
            // long-term and only 12% short-term. Everywhere else long-term wins.
            const lo = Math.max(0, otherIncome - ded)
            const hi = Math.max(0, otherIncome + gain - ded)
            const inWindow = hi > LTCG[s]!.zeroTop && lo < TWELVE_TOP[s]!

            if (lt > st + 1e-9) {
              expect(inWindow, `${s} other=${otherIncome} gain=${gain} is an UNDOCUMENTED reversal`)
                .toBe(true)
              violations.push({ where: `${s} other=${otherIncome} gain=${gain}`, excess: lt - st, gain })
              continue
            }
            expect(lt, `${s} other=${otherIncome} gain=${gain}`).toBeLessThanOrEqual(st + 1e-9)
          }
        }
      }

      expect(checked).toBeGreaterThan(400)
      // The window is genuinely reached, or the guard above proves nothing.
      expect(violations.length).toBeGreaterThan(0)
      // And it is a rounding error against the point of the page: never more
      // than three cents on the dollar, against savings of up to 22 cents.
      for (const v of violations) {
        expect(v.excess, v.where).toBeLessThanOrEqual(v.gain * 0.03 + 1e-9)
      }
    },
    30_000,
  )

  test.each(STATUSES)(
    '%s: the one window where the long-term rate is the DEARER one',
    (s) => {
      // Taxable income sits exactly on the maximum zero rate amount, and the
      // gain is exactly the strip up to the top of the 12% ordinary bracket.
      const { zeroTop } = LTCG[s]!
      const width = TWELVE_TOP[s]! - zeroTop
      expect(width, `${s} has a strip at all`).toBeGreaterThan(0)

      const v = { ...sale(width, s, zeroTop) }
      expect(shortTermTax({ ...v, ...SHORT })).toBeCloseTo(width * 0.12, 6)
      expect(longTermTax({ ...v, ...LONG })).toBeCloseTo(width * 0.15, 6)
    },
  )

  test('single: the window is $950 wide and costs $28.50 to be long-term', () => {
    // Worked by hand: taxable income 49,450, gain 950, so the stacked range is
    // 49,450 → 50,400, which is 12% ordinary and 15% long-term.
    const v = sale(950, 'single', 49_450)
    expect(shortTermTax({ ...v, ...SHORT })).toBeCloseTo(114, 6)
    expect(longTermTax({ ...v, ...LONG })).toBeCloseTo(142.5, 6)
    expect(142.5 - 114).toBeCloseTo(28.5, 6)
  })
})

describe('capital gains — a loss is an answer', () => {
  const loss = (amount: number, status = 'single') =>
    run({
      salePrice: 0,
      costBasis: amount,
      sellingCosts: 0,
      filingStatus: status,
      otherIncome: STD[status]! + 68_900,
      ...LONG,
    })

  test('is presented as a negative tax — a reduction, not a charge', () => {
    // $10,000 loss, single, ordinary taxable income 68,900 which is in the 22%
    // band. § 1211(b) lets $3,000 come off ordinary income this year:
    //   tax on 68,900        = 5,800 + 22% × 18,500 = 9,870
    //   tax on 65,900        = 5,800 + 22% × 15,500 = 9,210
    //   relief               =                          660  ( = 3,000 × 22% )
    const r = loss(10_000)
    expect(Number(r.primary.value)).toBeCloseTo(-660, 6)
    expect(3_000 * 0.22).toBeCloseTo(660, 6)
  })

  test('reports what is used this year and what carries forward', () => {
    const r = loss(10_000)
    const s = (label: string) => Number(r.stats!.find((x) => x.label.startsWith(label))!.value)
    expect(s('Net capital loss')).toBeCloseTo(10_000, 6)
    expect(s('Loss carried to future years')).toBeCloseTo(7_000, 6)
    // The relief is 660 on a 10,000 loss: 6.6% of it, not the 22% marginal
    // rate, because only $3,000 of the loss is usable this year. Reported as a
    // POSITIVE rate of relief, against a negative headline tax.
    expect(s('Effective rate of relief on the loss')).toBeCloseTo(6.6, 6)
  })

  test('the annual cap is $1,500 married filing separately', () => {
    const r = loss(10_000, 'marriedSeparate')
    const s = (label: string) => Number(r.stats!.find((x) => x.label.startsWith(label))!.value)
    expect(s('Loss carried to future years')).toBeCloseTo(8_500, 6)
    expect(Number(r.primary.value)).toBeCloseTo(-1_500 * 0.22, 6)
  })

  test('a small loss is used in full, with nothing carried forward', () => {
    const r = loss(1_200)
    const s = (label: string) => Number(r.stats!.find((x) => x.label.startsWith(label))!.value)
    expect(s('Loss carried to future years')).toBeCloseTo(0, 6)
    expect(Number(r.primary.value)).toBeCloseTo(-1_200 * 0.22, 6)
  })

  test('the holding period does not change the relief on a loss', () => {
    for (const days of [1, 365, 366, 5_000]) {
      const r = run({
        salePrice: 0,
        costBasis: 10_000,
        sellingCosts: 0,
        otherIncome: STD.single! + 68_900,
        holdingDays: days,
      })
      expect(Number(r.primary.value), `${days} days`).toBeCloseTo(-660, 6)
    }
  })

  test('relief is zero when there is no ordinary income to deduct it from', () => {
    const r = run({ salePrice: 0, costBasis: 10_000, sellingCosts: 0, otherIncome: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(0, 6)
  })

  test('selling costs alone can turn a break-even sale into a loss', () => {
    const r = run({ salePrice: 30_000, costBasis: 30_000, sellingCosts: 500 })
    expect(r.stats!.some((s) => s.label === 'Net capital loss')).toBe(true)
    expect(Number(r.primary.value)).toBeCloseTo(-500 * 0.22, 6)
  })

  test('a zero gain costs nothing and reports no rate', () => {
    const r = run({ salePrice: 30_500, costBasis: 30_000, sellingCosts: 500 })
    expect(Number(r.primary.value)).toBeCloseTo(0, 6)
    expect(Number(r.stats!.find((s) => s.label.startsWith('Effective rate'))!.value)).toBe(0)
  })
})

describe('capital gains — bad input', () => {
  const cases: ReadonlyArray<readonly [string, Partial<Input>]> = [
    ['salePrice', { salePrice: Number.NaN }],
    ['salePrice', { salePrice: -1 }],
    ['costBasis', { costBasis: Number.NaN }],
    ['costBasis', { costBasis: -1 }],
    ['sellingCosts', { sellingCosts: Number.NaN }],
    ['sellingCosts', { sellingCosts: -1 }],
    ['holdingDays', { holdingDays: Number.NaN }],
    ['holdingDays', { holdingDays: 0 }],
    ['otherIncome', { otherIncome: Number.NaN }],
    ['otherIncome', { otherIncome: -1 }],
    ['filingStatus', { filingStatus: 'widowed' }],
  ]

  test.each(cases.map(([field, patch], i) => [`${i} ${field}`, field, patch] as const))(
    '%s is refused against its own field',
    (_name, field, patch) => {
      let thrown: unknown
      try {
        run(patch)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(field)
    },
  )

  test('never returns NaN anywhere in the result', () => {
    for (const patch of [{}, { salePrice: 0 }, { otherIncome: 0 }, { costBasis: 10_000_000 }]) {
      const r = run(patch)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
      for (const s of r.steps!) if (!('rule' in s)) expect(Number.isFinite(Number(s.value))).toBe(true)
    }
  })
})

describe('capital gains — the drawn result', () => {
  const SAMPLES: Array<Partial<Input>> = []
  for (const f of fields) {
    if (f.kind === 'number') {
      const interior = [0.25, 0.5, 0.75].map((t) => f.min! + (f.max! - f.min!) * t)
      for (const v of [f.min!, f.max!, f.default, 0, 1, 2, ...interior]) {
        if (v >= f.min! && v <= f.max!) SAMPLES.push({ [f.id]: v } as Partial<Input>)
      }
    } else if (f.kind === 'select') {
      for (const o of f.options) SAMPLES.push({ [f.id]: o.value } as Partial<Input>)
    }
  }

  test('the series count never varies with input — never one line per rate band', () => {
    const atDefault = run().series!
    expect(atDefault).toHaveLength(2)
    for (const patch of SAMPLES) {
      let r
      try {
        r = run(patch)
      } catch {
        continue // a refusal is not an answer; nothing is drawn
      }
      expect(r.series, JSON.stringify(patch)).toHaveLength(2)
      expect(r.parts ?? []).toHaveLength(0)
    }
  })

  test('every series is ordered, finite, and drawable at the defaults', () => {
    for (const patch of [{}, ...SAMPLES]) {
      let r
      try {
        r = run(patch)
      } catch {
        continue
      }
      for (const s of r.series!) {
        expect(s.points.length, JSON.stringify(patch)).toBe(41)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]), JSON.stringify(patch)).toBe(true)
          expect(Number.isFinite(p[1]), JSON.stringify(patch)).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('the two lines are the comparison the page is about', () => {
    const [short, long] = run().series!
    expect(short!.label).toBe('Tax if short-term')
    expect(long!.label).toBe('Tax if long-term')
    // At the far right of the chart, where the gain is large, the long-term
    // line must sit strictly below the short-term one.
    const last = short!.points.length - 1
    expect(long!.points[last]![1]).toBeLessThan(short!.points[last]![1])
  })

  test('field defaults land on min + n x step, or the slider shifts when touched', () => {
    for (const f of fields) {
      if (f.kind !== 'number') continue
      const n = (f.default - f.min!) / f.step!
      expect(Math.abs(n - Math.round(n)), f.id).toBeLessThan(1e-9)
    }
  })

  test('every declared bound is a value compute accepts', () => {
    for (const f of fields) {
      if (f.kind !== 'number') continue
      for (const bound of [f.min!, f.max!]) {
        expect(() => run({ [f.id]: bound } as Partial<Input>), `${f.id}=${bound}`).not.toThrow()
      }
    }
  })
})

describe('capital gains — the definition', () => {
  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('has at least three substantial FAQs', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(120)
    }
  })

  test('every related slug already exists in the registry', () => {
    for (const slug of def.related) {
      expect(bySlug.has(slug), `capital-gains-calculator -> ${slug}`).toBe(true)
      expect(slug).not.toBe(def.slug)
    }
  })

  test('the tax year and the source are stated in the copy, not just in code', () => {
    const notes = run().notes!.join(' ')
    expect(notes).toContain('2026')
    expect(notes).toContain('Revenue Procedure 2025-32')
    expect(notes).toContain('4.03')
    // The exclusions must be named plainly.
    expect(notes).toMatch(/state and local/i)
    expect(notes).toMatch(/3\.8% net investment income tax/i)
    expect(notes).toMatch(/wash-sale/i)
    expect(notes).toMatch(/carryover/i)
    expect(def.disclaimer).toBe('financial')
  })

  test('the FAQ figures agree with the calculator', () => {
    // The FAQ quotes $4,290 / $2,925 / $1,365 for the default case.
    expect(shortTermTax()).toBeCloseTo(4_290, 6)
    expect(longTermTax()).toBeCloseTo(2_925, 6)
    expect(shortTermTax() - longTermTax()).toBeCloseTo(1_365, 6)
    // And $49,450 / $545,500 for a single filer's thresholds.
    expect(longTermTax({ ...sale(49_450, 'single'), ...LONG })).toBeCloseTo(0, 6)
    expect(longTermTax({ ...sale(49_451, 'single'), ...LONG })).toBeCloseTo(0.15, 6)
  })

  test('the definition holds no colour, class name, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })
})
