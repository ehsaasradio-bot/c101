/**
 * ★ THE SEAM, CLIENT HALF ★
 *
 * The browser-side counterpart to `./index.ts`. Pages import this, never a
 * concrete theme's script, so swapping themes means editing this one line
 * alongside the seven component exports and the `@import` in global.css.
 *
 * It also keeps the theme's behaviour in the page's main module chunk. A
 * standalone per-component script is small enough that Astro inlines it into
 * the HTML, which would force `'unsafe-inline'` back into the CSP.
 */
import './studio/studio.ts'
