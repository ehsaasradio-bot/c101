import type { CalculatorDef } from '../lib/types'
import { SITE_NAME, SITE_URL, absolute } from '../lib/site'

/**
 * Pure, testable JSON-LD builders. These live outside `src/theme/` on purpose:
 * in the reference implementation the structured data was emitted from inside
 * the 669-line presentation component, so a redesign would have silently
 * dropped it. Here a theme swap cannot reach this code.
 */

export const organization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
})

export const softwareApplication = (calc: CalculatorDef, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: calc.title,
  url,
  description: calc.description,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  dateModified: calc.lastReviewed,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
})

/**
 * Only emit this where the questions are actually visible on the page — which
 * the data model guarantees, since the theme renders the same `calc.faqs`.
 */
export const faqPage = (faqs: ReadonlyArray<{ q: string; a: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: { '@type': 'Answer', text: faq.a },
  })),
})

export const breadcrumbList = (items: ReadonlyArray<{ name: string; href: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: absolute(item.href),
  })),
})

export const itemList = (items: ReadonlyArray<{ title: string; href: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  numberOfItems: items.length,
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.title,
    url: absolute(item.href),
  })),
})
