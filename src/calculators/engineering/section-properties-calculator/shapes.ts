/**
 * One shape, reduced to the primitives every section property is built from.
 *
 * Only these branch. The parallel-axis shift, the polar moments, the radii of
 * gyration and the elastic moduli are written once against them, because those
 * relationships belong to any plane area regardless of its outline.
 *
 * All of this is classical geometry — the same closed forms appear in NDS,
 * AISC, Eurocode or an 1870 textbook — so nothing here depends on a licensed
 * design-value table.
 */

export interface Dims {
  /** Overall height, depth, major axis, or side length. */
  a: number
  /** Overall width, or minor axis. */
  b: number
  /** Web or wall thickness. */
  t1: number
  /** Flange thickness. */
  t2: number
  /** Side count, for a regular polygon. */
  n: number
  /** Degrees — sector angle, or rotation. */
  angle: number
}

export interface Primitives {
  /** Material area. */
  A: number
  /** The enclosing envelope, for the material-vs-void proportion. */
  gross: number
  /** Outer perimeter, and the inner one where a bore exists (0 otherwise). */
  Po: number
  Pi: number
  /** Centroid from the left and bottom of the bounding box. */
  cx: number
  cy: number
  /**
   * Centroid to the extreme fibre, each way. Equal to half the depth on a
   * symmetric section and NOT equal on a tee, channel, angle or half circle —
   * which is exactly why the elastic modulus needs both.
   */
  cTop: number
  cBot: number
  cLeft: number
  cRight: number
  /** Second moments about the centroidal axes. */
  Ix: number
  Iy: number
  /** Plastic moduli: the first moment of both halves about the equal-area axis. */
  Zx: number
  Zy: number
  /** The formula shown beside each value, so the working follows the shape. */
  formulas: {
    A: string
    Ix: string
    Iy: string
    Zx: string
    Zy: string
  }
}

/** Thrown with the field id so the form can highlight the offending box. */
export class ShapeError extends Error {
  constructor(
    message: string,
    public fieldId: string,
  ) {
    super(message)
  }
}

export type ShapeFn = (d: Dims) => Primitives
