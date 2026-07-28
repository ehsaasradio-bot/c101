/**
 * ★ THE SEAM ★
 *
 * Every page imports its presentation from this module and never from a
 * concrete theme file. Swapping the entire look is therefore this file plus the
 * one `@import` in `src/styles/global.css` — nine lines, no page touched, no
 * calculator definition touched.
 *
 *   -export { default as CalculatorPage } from './default/CalculatorPage.astro'
 *   +export { default as CalculatorPage } from './editorial/CalculatorPage.astro'
 *
 * A palette-only reskin does not even need this file — edit `tokens.css`.
 *
 * A new theme must implement every slot below against `./contract.ts`, or
 * `astro check` fails.
 */

export { default as Shell } from './studio/Shell.astro'
export { default as Hero } from './studio/Hero.astro'
export { default as CalculatorPage } from './studio/CalculatorPage.astro'
export { default as Breadcrumbs } from './studio/Breadcrumbs.astro'
export { default as CalculatorGrid } from './studio/CalculatorGrid.astro'
export { default as CategoryGrid } from './studio/CategoryGrid.astro'
export { default as FaqList } from './studio/FaqList.astro'
export { default as RelatedGrid } from './studio/RelatedGrid.astro'
