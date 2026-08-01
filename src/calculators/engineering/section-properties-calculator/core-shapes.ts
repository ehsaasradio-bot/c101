import { ShapeError } from './shapes'
import type { Dims, Primitives, ShapeFn } from './shapes'

/**
 * The four sections that predate the shape modules: a rectangle and a circle,
 * each solid or hollow. They are expressed as `ShapeFn` like everything else so
 * `compute.ts` has exactly one code path, and so the hollow pair can keep
 * reading an explicit inner dimension rather than a wall thickness — which is
 * how a box or a bore is actually dimensioned on a drawing.
 *
 * `Dims.t1` carries the inner height / inner diameter here, and `Dims.t2` the
 * inner width. That is the one place the generic names are stretched, and it is
 * why the mapping lives in compute.ts beside the field ids rather than here.
 */

const finite = (x: number, field: string, what: string): number => {
  // Finiteness first: coerceValues emits NaN for unparseable input, and every
  // magnitude test below is false for NaN, so it would slip straight through.
  if (!Number.isFinite(x)) throw new ShapeError(`Enter a ${what}.`, field)
  return x
}

const positive = (x: number, field: string, what: string): number => {
  finite(x, field, what)
  if (!(x > 0)) throw new ShapeError(`Enter a ${what} greater than zero.`, field)
  return x
}

/** Rectangle primitives, outer less a concentric inner one. */
function rect(a: number, b: number, a1: number, b1: number): Primitives {
  const gross = a * b
  const voidArea = a1 * b1
  const A = gross - voidArea
  return {
    A,
    gross,
    Po: 2 * (a + b),
    Pi: voidArea > 0 ? 2 * (a1 + b1) : 0,
    cx: b / 2,
    cy: a / 2,
    cTop: a / 2,
    cBot: a / 2,
    cLeft: b / 2,
    cRight: b / 2,
    Ix: (b * a ** 3 - b1 * a1 ** 3) / 12,
    Iy: (b ** 3 * a - b1 ** 3 * a1) / 12,
    Zx: (b * a ** 2 - b1 * a1 ** 2) / 4,
    Zy: (a * b ** 2 - a1 * b1 ** 2) / 4,
    formulas: {
      A: voidArea > 0 ? 'A = ab − a₁b₁' : 'A = ab',
      Ix: voidArea > 0 ? 'Ix = (ba³ − b₁a₁³) / 12' : 'Ix = ba³ / 12',
      Iy: voidArea > 0 ? 'Iy = (b³a − b₁³a₁) / 12' : 'Iy = b³a / 12',
      Zx: voidArea > 0 ? 'Zx = (ba² − b₁a₁²) / 4' : 'Zx = ba² / 4',
      Zy: voidArea > 0 ? 'Zy = (ab² − a₁b₁²) / 4' : 'Zy = ab² / 4',
    },
  }
}

/** Circle primitives, outer less a concentric bore. */
function circ(D: number, d: number): Primitives {
  const R = D / 2
  const r = d / 2
  const gross = Math.PI * R ** 2
  const voidArea = Math.PI * r ** 2
  const Ix = (Math.PI * (R ** 4 - r ** 4)) / 4
  return {
    A: gross - voidArea,
    gross,
    Po: Math.PI * D,
    Pi: voidArea > 0 ? Math.PI * d : 0,
    cx: R,
    cy: R,
    cTop: R,
    cBot: R,
    cLeft: R,
    cRight: R,
    Ix,
    // A circle is symmetric about every axis through its centre.
    Iy: Ix,
    Zx: (4 / 3) * (R ** 3 - r ** 3),
    Zy: (4 / 3) * (R ** 3 - r ** 3),
    formulas: {
      A: voidArea > 0 ? 'A = π(R² − r²)' : 'A = πR²',
      Ix: voidArea > 0 ? 'Ix = π(R⁴ − r⁴) / 4' : 'Ix = πR⁴ / 4',
      Iy: voidArea > 0 ? 'Iy = π(R⁴ − r⁴) / 4' : 'Iy = πR⁴ / 4',
      Zx: voidArea > 0 ? 'Zx = 4(R³ − r³) / 3' : 'Zx = 4R³ / 3',
      Zy: voidArea > 0 ? 'Zy = 4(R³ − r³) / 3' : 'Zy = 4R³ / 3',
    },
  }
}

export const CORE_SHAPES: Record<string, ShapeFn> = {
  rectangle: (d: Dims) =>
    rect(positive(d.a, 'a', 'outer height'), positive(d.b, 'b', 'outer width'), 0, 0),

  hollowRectangle: (d: Dims) => {
    const a = positive(d.a, 'a', 'outer height')
    const b = positive(d.b, 'b', 'outer width')
    const a1 = finite(d.t1, 'innerHeight', 'inner height')
    const b1 = finite(d.t2, 'innerWidth', 'inner width')
    if (a1 < 0) throw new ShapeError('Enter an inner height of zero or more.', 'innerHeight')
    if (b1 < 0) throw new ShapeError('Enter an inner width of zero or more.', 'innerWidth')
    if (a1 >= a)
      throw new ShapeError(
        'The inner height has to be less than the outer height, or there is no material left to carry anything.',
        'innerHeight',
      )
    if (b1 >= b)
      throw new ShapeError(
        'The inner width has to be less than the outer width, or there is no material left to carry anything.',
        'innerWidth',
      )
    // Either inner dimension at zero collapses the hole to a line of no area,
    // which is a solid section written the long way round rather than an error.
    return rect(a, b, a1, b1)
  },

  circle: (d: Dims) => circ(positive(d.a, 'diameter', 'outer diameter'), 0),

  hollowCircle: (d: Dims) => {
    const D = positive(d.a, 'diameter', 'outer diameter')
    const bore = finite(d.t1, 'innerDiameter', 'inner diameter')
    if (bore < 0) throw new ShapeError('Enter an inner diameter of zero or more.', 'innerDiameter')
    if (bore >= D)
      throw new ShapeError(
        'The inner diameter has to be less than the outer one, or there is no wall left to carry anything.',
        'innerDiameter',
      )
    return circ(D, bore)
  },
}
