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
import amortization from './financial/amortization-calculator'
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
import simpleInterest from './financial/simple-interest-calculator'
import apr from './financial/apr-calculator'
import downPayment from './financial/down-payment-calculator'
import debtPayoff from './financial/debt-payoff-calculator'
import rentVsBuy from './financial/rent-vs-buy-calculator'
import refinance from './financial/refinance-calculator'
import incomeTax from './financial/income-tax-calculator'
import paycheck from './financial/paycheck-calculator'
import plan401k from './financial/401k-calculator'
import budget from './financial/budget-calculator'
import presentValue from './financial/present-value-calculator'
import npv from './financial/npv-calculator'
import carLease from './financial/car-lease-calculator'
import mortgagePoints from './financial/mortgage-points-calculator'
import capitalGains from './financial/capital-gains-calculator'
import rothIra from './financial/roth-ira-calculator'

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
import dueDate from './health/due-date-calculator'
import vo2max from './health/vo2max-calculator'
import waistHip from './health/waist-hip-calculator'
import bodySurfaceArea from './health/body-surface-area-calculator'
import leanBodyMass from './health/lean-body-mass-calculator'
import ovulation from './health/ovulation-calculator'
import caloriesBurned from './health/calories-burned-calculator'
import caloricDeficit from './health/caloric-deficit-calculator'

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
import area from './math/area-calculator'
import volume from './math/volume-calculator'
import probability from './math/probability-calculator'
import zScore from './math/z-score-calculator'
import slope from './math/slope-calculator'
import logarithm from './math/logarithm-calculator'
import combination from './math/combination-calculator'
import prime from './math/prime-calculator'
import squareRoot from './math/square-root-calculator'
import exponent from './math/exponent-calculator'
import factorial from './math/factorial-calculator'
import distance from './math/distance-calculator'
import confidenceInterval from './math/confidence-interval-calculator'
import halfLife from './math/half-life-calculator'

// everyday
import tip from './everyday/tip-calculator'
import age from './everyday/age-calculator'
import dateDifference from './everyday/date-difference-calculator'
import unitConverter from './everyday/unit-converter-calculator'
import fuelCost from './everyday/fuel-cost-calculator'
import discount from './everyday/discount-calculator'
import electricityCost from './everyday/electricity-cost-calculator'
import cookingConverter from './everyday/cooking-converter-calculator'
import gpa from './everyday/gpa-calculator'
import paint from './everyday/paint-calculator'
import businessDays from './everyday/business-days-calculator'
import concrete from './everyday/concrete-calculator'
import tile from './everyday/tile-calculator'
import grade from './everyday/grade-calculator'
import timeZoneConverter from './everyday/time-zone-converter-calculator'
import ohmsLaw from './everyday/ohms-law-calculator'
import timeCard from './everyday/time-card-calculator'
export const calculators: readonly CalculatorDef[] = [
  mortgage,
  amortization,
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
  simpleInterest,
  apr,
  downPayment,
  debtPayoff,
  rentVsBuy,
  refinance,
  incomeTax,
  paycheck,
  plan401k,
  budget,
  presentValue,
  npv,
  carLease,
  mortgagePoints,
  capitalGains,
  rothIra,
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
  dueDate,
  vo2max,
  waistHip,
  bodySurfaceArea,
  leanBodyMass,
  ovulation,
  caloriesBurned,
  caloricDeficit,
  percentage,
  percentageChange,
  fraction,
  average,
  quadratic,
  rightTriangle,
  circle,
  gcdLcm,
  ratio,
  area,
  volume,
  probability,
  zScore,
  slope,
  logarithm,
  combination,
  prime,
  squareRoot,
  exponent,
  factorial,
  distance,
  confidenceInterval,
  halfLife,
  tip,
  age,
  dateDifference,
  unitConverter,
  fuelCost,
  discount,
  electricityCost,
  cookingConverter,
  gpa,
  paint,
  businessDays,
  concrete,
  tile,
  grade,
  timeZoneConverter,
  ohmsLaw,
  timeCard,
]

export const bySlug: ReadonlyMap<string, CalculatorDef> = new Map(
  calculators.map((c) => [c.slug, c]),
)

export const byCategory = Map.groupBy(calculators, (c) => c.category)
