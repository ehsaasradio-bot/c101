import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'car-lease-calculator',
  category: 'financial',
  title: 'Car Lease Calculator',
  seoTitle: 'Car Lease Calculator: Money Factor to APR',
  description:
    'Work out a car lease payment from cap cost, residual and money factor — and see the APR that money factor is quietly standing in for.',
  intro:
    'A lease payment is not a loan payment. It is two things added together: the depreciation you use up, spread evenly over the term, plus a rent charge on the money the bank has tied up in the car. The rent charge is quoted as a money factor rather than a rate — multiply it by 2400 and you have the APR, which is the number the dealer would rather you did not work out.',
  fields,
  resultLabel: 'Monthly payment',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% residual',
    bands: [
      { id: 'critical', label: 'Under 45% residual — steep depreciation', from: 0, to: 45 },
      { id: 'warn', label: '45% to 52% — below average', from: 45, to: 52 },
      { id: 'good', label: '52% to 60% — holds its value well', from: 52, to: 60 },
      { id: 'excellent', label: '60% or more — exceptional residual', from: 60, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is a money factor, and how do I convert it to an APR?',
      a: 'A money factor is an interest rate divided by 2400. Multiply it by 2400 to get the APR: 0.00125 is 3%, 0.00250 is 6%, and 0.00375 is 9%. Going the other way, divide the APR by 2400 — a 4.8% rate is a money factor of 0.002. The 2400 is not arbitrary. The rent charge is charged on the adjusted cap cost plus the residual, and the balance falls in a straight line between those two ends, so their average is half their sum. Charging monthly interest on that average and setting it equal to the rent charge gives a monthly rate of twice the money factor, an annual rate of 24 times it, and 2400 times it expressed as a percentage. Some dealers quote the factor as a whole number — "125" or "one twenty-five" — which means 0.00125.',
    },
    {
      q: 'Why is the rent charge based on the cap cost plus the residual?',
      a: 'Because it is an interest charge on the average amount outstanding, and adding the two ends and multiplying by the money factor is an algebraically exact shortcut for that. It surprises people, because everywhere else in finance you subtract. The consequence is worth knowing: a high residual cuts your depreciation but raises your rent charge, so on a car that holds its value the finance charge buried in the payment is a bigger share of it than you would guess.',
    },
    {
      q: 'How is a lease payment different from a car loan payment?',
      a: 'A loan amortizes: every payment is part interest, part principal, and the split shifts month by month until the balance reaches zero. A lease does not. You pay a fixed slice of depreciation each month — the amount the car is expected to lose, divided evenly by the term — plus a rent charge that is the same every month because it is computed once from the two fixed endpoints. That is why a lease payment on the same car is lower: you are only paying off the part of the car you use, not all of it.',
    },
    {
      q: 'Is putting cash down on a lease a good idea?',
      a: 'Usually not. A cap cost reduction does lower the payment, and it lowers it twice over — less to depreciate and a smaller balance to charge rent on — but it buys you no equity at all. If the car is stolen or written off in the first few months, gap coverage settles with the bank and your down payment is simply gone. Most lease guidance is to put as little down as the deal allows and accept the higher payment.',
    },
    {
      q: 'What does this calculator leave out?',
      a: 'The acquisition fee, the disposition fee at the end, dealer documentation fees, title and registration, and sales tax. Tax treatment varies a great deal: most US states tax each monthly payment, a few tax the full capitalized cost up front. Any fee you roll into the lease rather than pay separately should be added to the negotiated price, where it will be depreciated and charged rent on like the rest of the cap cost. Excess mileage and wear charges at turn-in are also excluded.',
    },
    {
      q: 'What counts as a good residual value?',
      a: 'For a 36-month lease, roughly 55% to 60% of MSRP is typical, and anything above 60% is a car with unusually strong resale. Shorter terms carry higher residuals because the car has less time to lose value; a 24-month lease might residual at 65% and a 48-month one in the high forties. The residual is set by the bank, not the dealer, so it is one of the few numbers in a lease that is genuinely not negotiable — but it is also your buyout price if you decide to keep the car.',
    },
  ],
  related: ['auto-loan-calculator', 'apr-calculator', 'loan-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def
