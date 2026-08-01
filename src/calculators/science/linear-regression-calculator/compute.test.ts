import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

const base: Input = {
  xValues: '1, 2, 3, 4, 5',
  yValues: '2.1, 4.2, 5.9, 8.1, 9.9',
  predictX: 10,
}

const X = [1, 2, 3, 4, 5]
const Y = [2.1, 4.2, 5.9, 8.1, 9.9]

const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)

const throwsOn = (input: Input): CalcError => {
  let thrown: unknown
  try {
    compute(input)
  } catch (err) {
    thrown = err
  }
  expect(thrown).toBeInstanceOf(CalcError)
  return thrown as CalcError
}

/**
 * An independent least-squares fit, from the raw-moment form of the normal
 * equations rather than the centred sums compute.ts uses:
 *
 *   b = (nΣxy − ΣxΣy) / (nΣx² − (Σx)²),  a = (Σy − bΣx) / n
 *
 * Algebraically the same line, arithmetically a different route to it — which is
 * the point. Agreement between the two is evidence; a reference that reused the
 * centred sums would only be checking that the code equals itself.
 */
function refFit(xs: number[], ys: number[]) {
  const n = xs.length
  const sumX = xs.reduce((s, x) => s + x, 0)
  const sumY = ys.reduce((s, y) => s + y, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i]!, 0)
  const sumXX = xs.reduce((s, x) => s + x * x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

describe('linear-regression', () => {
  describe('the default data set', () => {
    test('predicts 19.69 at x = 10', () => {
      // x̄ = 3, ȳ = 6.04. Sxx = 4+1+0+1+4 = 10 and Sxy = 7.88+1.84+0+2.06+7.72
      // = 19.5, so b = 1.95 and a = 6.04 − 1.95x3 = 0.19. At x = 10 that is
      // 0.19 + 19.5 = 19.69, and the independent fit below reaches the same line.
      const r = compute(base)
      const reference = refFit(X, Y)
      expect(Number(r.primary.value)).toBeCloseTo(19.69, 10)
      expect(Number(r.primary.value)).toBeCloseTo(
        reference.intercept + reference.slope * 10,
        10,
      )
      expect(r.primary.label).toBe('Predicted y at x = 10')
    })

    test('the slope and intercept match the raw-moment normal equations', () => {
      const r = compute(base)
      const reference = refFit(X, Y)
      expect(Number(stat(r, 'Slope b')!.value)).toBeCloseTo(reference.slope, 10)
      expect(Number(stat(r, 'Slope b')!.value)).toBeCloseTo(1.95, 10)
      expect(Number(stat(r, 'Intercept a')!.value)).toBeCloseTo(reference.intercept, 10)
      expect(Number(stat(r, 'Intercept a')!.value)).toBeCloseTo(0.19, 10)
      expect(stat(r, 'Equation of the line')!.value).toBe('ŷ = 0.19 + 1.95x')
    })

    test('the residuals satisfy the normal equations, which is what "least squares" means', () => {
      // The optimal line is the one whose residuals sum to zero and are
      // uncorrelated with x. Checking that is checking optimality itself, not
      // just reproducing an arithmetic result.
      const r = compute(base)
      const slope = Number(stat(r, 'Slope b')!.value)
      const intercept = Number(stat(r, 'Intercept a')!.value)
      const residuals = X.map((x, i) => Y[i]! - (intercept + slope * x))
      expect(residuals.reduce((s, e) => s + e, 0)).toBeCloseTo(0, 10)
      expect(X.reduce((s, x, i) => s + x * residuals[i]!, 0)).toBeCloseTo(0, 10)

      // And no nearby line does better — a genuine minimum, probed either side.
      const sse = (a: number, b: number) =>
        X.reduce((s, x, i) => s + (Y[i]! - (a + b * x)) ** 2, 0)
      const best = sse(intercept, slope)
      for (const delta of [-0.01, 0.01]) {
        expect(sse(intercept, slope + delta)).toBeGreaterThan(best)
        expect(sse(intercept + delta, slope)).toBeGreaterThan(best)
      }
    })

    test('r, R² and the standard errors', () => {
      const r = compute(base)
      // Syy = 38.072 and SSR = b x Sxy = 1.95 x 19.5 = 38.025, so R² is
      // 38.025 / 38.072 = 0.998765 and r is its square root, positive because
      // Sxy is positive.
      expect(Number(stat(r, 'R² (variation explained)')!.value)).toBeCloseTo(0.9987654969531413, 12)
      expect(Number(stat(r, 'Correlation r')!.value)).toBeCloseTo(0.999382557859172, 12)
      expect(Number(stat(r, 'Correlation r')!.value) ** 2).toBeCloseTo(
        Number(stat(r, 'R² (variation explained)')!.value),
        12,
      )
      // s = sqrt(SSE / (n − 2)) = sqrt(0.047 / 3), cross-checked against SSE
      // summed directly from the residuals rather than taken by subtraction.
      const slope = 1.95
      const intercept = 0.19
      const sseDirect = X.reduce((s, x, i) => s + (Y[i]! - (intercept + slope * x)) ** 2, 0)
      expect(Number(stat(r, 'Standard error of the estimate')!.value)).toBeCloseTo(
        Math.sqrt(sseDirect / 3),
        10,
      )
      expect(Number(stat(r, 'Standard error of the estimate')!.value)).toBeCloseTo(0.1251666, 6)
      // The slope's own standard error is s / sqrt(Sxx) = 0.1251666 / sqrt(10).
      expect(Number(stat(r, 'Standard error of the slope')!.value)).toBeCloseTo(0.03958114, 7)
      expect(Number(stat(r, 'Points used')!.value)).toBe(5)
    })
  })

  describe('the variance decomposition', () => {
    test('SSR + SSE add up to SST exactly, and neither is negative', () => {
      const r = compute(base)
      expect(r.parts).toHaveLength(2)
      const total = Number(r.partsTotal!.value)
      expect(total).toBeCloseTo(38.072, 10)
      expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(total, 10)
      for (const part of r.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
      expect(r.parts![0]!.value).toBeCloseTo(38.025, 10)
      expect(r.parts![1]!.value).toBeCloseTo(0.047, 10)
    })

    test('the explained share is exactly R²', () => {
      const r = compute(base)
      const explained = r.parts![0]!.value / Number(r.partsTotal!.value)
      expect(explained).toBeCloseTo(Number(stat(r, 'R² (variation explained)')!.value), 12)
    })

    test('a perfect fit leaves a residual of exactly zero, never a negative sliver', () => {
      // Deriving SSE by subtraction and clamping is what keeps this at 0 rather
      // than at -5.7e-17, which would fail the non-negative check on parts.
      const r = compute({ ...base, xValues: '1, 2, 3', yValues: '2, 4, 6' })
      expect(r.parts![1]!.value).toBe(0)
      expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(
        Number(r.partsTotal!.value),
        12,
      )
      expect(Number(stat(r, 'R² (variation explained)')!.value)).toBeCloseTo(1, 12)
      expect(stat(r, 'Equation of the line')!.value).toBe('ŷ = 2x')
    })

    test('flat y has nothing to decompose, so no parts are claimed', () => {
      const r = compute({ ...base, xValues: '1, 2, 3', yValues: '5, 5, 5' })
      expect(r.parts).toEqual([])
      expect(Number(r.primary.value)).toBe(5)
      expect(stat(r, 'Equation of the line')!.value).toBe('ŷ = 5')
      expect(String(stat(r, 'Correlation r')!.value)).toContain('Undefined')
      expect(String(stat(r, 'R² (variation explained)')!.value)).toContain('Undefined')
    })
  })

  describe('the chart', () => {
    test('plots the fitted line at the defaults, spanning the data and the prediction', () => {
      const r = compute(base)
      expect(r.series).toHaveLength(1)
      const points = r.series![0]!.points
      expect(points.length).toBeGreaterThan(1)
      // The data runs 1..5 and the prediction is at 10, so the line covers both.
      expect(points[0]![0]).toBeCloseTo(1, 10)
      expect(points[points.length - 1]![0]).toBeCloseTo(10, 10)
      // The final point is the headline, so the curve and the number agree.
      expect(points[points.length - 1]![1]).toBeCloseTo(Number(r.primary.value), 10)
    })

    test('every plotted point lies on the line — it is the fit, not the scatter', () => {
      const r = compute(base)
      const slope = Number(stat(r, 'Slope b')!.value)
      const intercept = Number(stat(r, 'Intercept a')!.value)
      for (const [x, y] of r.series![0]!.points) {
        expect(y).toBeCloseTo(intercept + slope * x, 10)
      }
    })

    test('x stays strictly increasing even when the data repeats an x value', () => {
      // Duplicate x values are ordinary regression data — three plants measured
      // in week 2 — and would tie in a scatter series, which the conformance
      // suite forbids. The fitted line is monotone by construction.
      const r = compute({ ...base, xValues: '1, 2, 2, 3', yValues: '2, 3, 5, 6' })
      const points = r.series![0]!.points
      points.forEach((point, i) => {
        expect(Number.isFinite(point[0])).toBe(true)
        expect(Number.isFinite(point[1])).toBe(true)
        if (i > 0) expect(point[0]).toBeGreaterThan(points[i - 1]![0])
      })
      expect(points.length).toBeGreaterThan(4)
    })
  })

  describe('boundaries and refusals', () => {
    test('nudging the prediction moves the headline', () => {
      // The end-to-end suite sets the only number field to 1.1x its default and
      // requires a different result. b x 1 = 1.95, so 19.69 becomes 21.64.
      expect(Number(compute({ ...base, predictX: 11 }).primary.value)).toBeCloseTo(21.64, 10)
      expect(Number(compute({ ...base, predictX: 11 }).primary.value)).not.toBe(
        Number(compute(base).primary.value),
      )
    })

    test('two points reproduce the exact line a slope calculator would draw', () => {
      // From (1, 2) to (3, 8): rise 6 over run 2, so the slope is 3 and the
      // intercept is 2 − 3 = −1. The fit is exact, which leaves no degrees of
      // freedom for a residual standard error.
      const r = compute({ ...base, xValues: '1, 3', yValues: '2, 8' })
      expect(Number(stat(r, 'Slope b')!.value)).toBeCloseTo(3, 12)
      expect(Number(stat(r, 'Intercept a')!.value)).toBeCloseTo(-1, 12)
      expect(String(stat(r, 'Standard error of the estimate')!.value)).toContain('Undefined')
      expect(String(stat(r, 'Standard error of the slope')!.value)).toContain('Undefined')
    })

    test('a negative relationship reads correctly in the equation', () => {
      const r = compute({ ...base, xValues: '1, 2, 3', yValues: '6, 4, 2' })
      expect(stat(r, 'Equation of the line')!.value).toBe('ŷ = 8 − 2x')
      expect(Number(stat(r, 'Correlation r')!.value)).toBeCloseTo(-1, 12)
      expect(Number(stat(r, 'R² (variation explained)')!.value)).toBeCloseTo(1, 12)
    })

    test('warns when the prediction sits outside the data', () => {
      const outside = compute(base).notes!.join(' ')
      expect(outside).toContain('outside the data')
      const inside = compute({ ...base, predictX: 3 }).notes!.join(' ')
      expect(inside).not.toContain('outside the data')
    })

    test.each([
      ['mismatched list lengths', { yValues: '1, 2, 3' }, 'yValues'],
      ['a single point', { xValues: '4', yValues: '9' }, 'xValues'],
      ['no variation in x', { xValues: '3, 3, 3', yValues: '1, 2, 3' }, 'xValues'],
      ['an empty x list', { xValues: '  ' }, 'xValues'],
      ['an empty y list', { yValues: ' , ; ' }, 'yValues'],
      ['a non-numeric x', { xValues: '1, two, 3', yValues: '1, 2, 3' }, 'xValues'],
      ['a stray unit in y', { yValues: '2.1kg, 4.2, 5.9, 8.1, 9.9' }, 'yValues'],
    ])('refuses %s', (_label, override, fieldId) => {
      expect(throwsOn({ ...base, ...override }).fieldId).toBe(fieldId)
    })

    test('an unparseable prediction is caught before anything else', () => {
      expect(throwsOn({ ...base, predictX: Number.NaN }).fieldId).toBe('predictX')
    })

    test('separators, negatives and decimals all parse the same', () => {
      const commas = compute(base)
      for (const xValues of ['1 2 3 4 5', '1;2;3;4;5', '1\n2\n3\n4\n5', ' 1 , 2 , 3 , 4 , 5 ']) {
        expect(Number(compute({ ...base, xValues }).primary.value)).toBeCloseTo(
          Number(commas.primary.value),
          12,
        )
      }
      const negatives = compute({ ...base, xValues: '-2, -1, 0, 1, 2', yValues: '-4, -2, 0, 2, 4' })
      expect(Number(stat(negatives, 'Slope b')!.value)).toBeCloseTo(2, 12)
      expect(Number(negatives.primary.value)).toBeCloseTo(20, 12)
    })

    test('never returns NaN for valid input', () => {
      const r = compute({ ...base, xValues: '1e3, 2e3, 3e3', yValues: '0.0001, -5, 12' })
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      for (const s of r.stats!) {
        if (typeof s.value === 'number') expect(Number.isNaN(s.value)).toBe(false)
      }
      for (const part of r.parts!) expect(Number.isFinite(part.value)).toBe(true)
      for (const [x, y] of r.series![0]!.points) {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    })
  })
})
