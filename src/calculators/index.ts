import type { CalculatorDef } from '../lib/types'

// An explicit barrel, deliberately not `import.meta.glob`.
//
// `import.meta.glob` is Vite-only syntax, which would make this module
// unimportable from Playwright specs, the Astro config, and plain node scripts —
// all of which need it to derive their work from the data. One boring import
// line per calculator buys a registry that every context can read, and a missing
// file becomes a compile error instead of a silently shorter glob.
// financial
import mortgage from './financial/mortgage-calculator'
import loan from './financial/loan-calculator'
import autoLoan from './financial/auto-loan-calculator'
import creditCardPayoff from './financial/credit-card-payoff-calculator'
import compoundInterest from './financial/compound-interest-calculator'
import savingsGoal from './financial/savings-goal-calculator'
import retirement from './financial/retirement-calculator'
import roi from './financial/roi-calculator'
import inflation from './financial/inflation-calculator'
import salary from './financial/salary-calculator'
import houseAffordability from './financial/house-affordability-calculator'
import breakEven from './financial/break-even-calculator'
import netWorth from './financial/net-worth-calculator'
import salesTax from './financial/sales-tax-calculator'

// health
import bmi from './health/bmi-calculator'
import bmr from './health/bmr-calculator'
import tdee from './health/tdee-calculator'
import bodyFat from './health/body-fat-calculator'
import idealWeight from './health/ideal-weight-calculator'
import macro from './health/macro-calculator'
import waterIntake from './health/water-intake-calculator'
import heartRateZone from './health/heart-rate-zone-calculator'
import oneRepMax from './health/one-rep-max-calculator'
import runningPace from './health/running-pace-calculator'

// math
import percentage from './math/percentage-calculator'
import percentageChange from './math/percentage-change-calculator'
import fraction from './math/fraction-calculator'
import average from './math/average-calculator'
import quadratic from './math/quadratic-calculator'
import rightTriangle from './math/right-triangle-calculator'
import circle from './math/circle-calculator'
import gcdLcm from './math/gcd-lcm-calculator'
import ratio from './math/ratio-calculator'

// everyday
import tip from './everyday/tip-calculator'
import age from './everyday/age-calculator'
import dateDifference from './everyday/date-difference-calculator'
import unitConverter from './everyday/unit-converter-calculator'
import fuelCost from './everyday/fuel-cost-calculator'
import discount from './everyday/discount-calculator'
import electricityCost from './everyday/electricity-cost-calculator'
import cookingConverter from './everyday/cooking-converter-calculator'
export const calculators: readonly CalculatorDef[] = [
  mortgage,
  loan,
  autoLoan,
  creditCardPayoff,
  compoundInterest,
  savingsGoal,
  retirement,
  roi,
  inflation,
  salary,
  houseAffordability,
  breakEven,
  netWorth,
  salesTax,
  bmi,
  bmr,
  tdee,
  bodyFat,
  idealWeight,
  macro,
  waterIntake,
  heartRateZone,
  oneRepMax,
  runningPace,
  percentage,
  percentageChange,
  fraction,
  average,
  quadratic,
  rightTriangle,
  circle,
  gcdLcm,
  ratio,
  tip,
  age,
  dateDifference,
  unitConverter,
  fuelCost,
  discount,
  electricityCost,
  cookingConverter,
]

export const bySlug: ReadonlyMap<string, CalculatorDef> = new Map(
  calculators.map((c) => [c.slug, c]),
)

export const byCategory = Map.groupBy(calculators, (c) => c.category)
