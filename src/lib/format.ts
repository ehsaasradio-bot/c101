import type { FormatSpec, Quantity, FormattedQuantity } from './types'
import { CURRENCY } from './site'

/**
 * Pure display formatting. Runs identically at build time (Node) and in the
 * browser (the island), so the server-rendered text and the first client
 * recompute agree. The locale is pinned rather than taken from the runtime for
 * exactly that reason.
 */
const LOCALE = 'en-US'

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

function formatDuration(total: number, from: NonNullable<Extract<FormatSpec, { style: 'duration' }>['from']>): string {
  if (!Number.isFinite(total)) return '—'
  const n = Math.max(0, Math.round(total))

  if (from === 'months') {
    const years = Math.floor(n / 12)
    const months = n % 12
    if (years === 0) return plural(months, 'month')
    if (months === 0) return plural(years, 'year')
    return `${plural(years, 'year')} ${plural(months, 'month')}`
  }

  if (from === 'days') {
    if (n < 31) return plural(n, 'day')
    const years = Math.floor(n / 365)
    const days = n % 365
    const months = Math.floor(days / 30)
    if (years === 0) return months === 0 ? plural(days, 'day') : `${plural(months, 'month')} ${plural(days % 30, 'day')}`
    return months === 0 ? plural(years, 'year') : `${plural(years, 'year')} ${plural(months, 'month')}`
  }

  if (from === 'minutes') {
    const hours = Math.floor(n / 60)
    const minutes = n % 60
    if (hours === 0) return plural(minutes, 'minute')
    return minutes === 0 ? plural(hours, 'hour') : `${hours}h ${minutes}m`
  }

  // seconds
  const hours = Math.floor(n / 3600)
  const minutes = Math.floor((n % 3600) / 60)
  const seconds = n % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * `Intl.NumberFormat` is expensive to construct and cheap to reuse, but a
 * result can carry thirty formatted figures and every keystroke rebuilds all of
 * them. Constructing one per value made formatting, not arithmetic, the bulk of
 * the cost of a recalculation. There are only a handful of distinct shapes, so
 * they are built once and kept.
 */
const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, options)
    formatters.set(key, formatter)
  }
  return formatter
}

export function formatValue(value: number | string, spec: FormatSpec): string {
  if (spec.style === 'raw') return String(value)

  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'

  switch (spec.style) {
    case 'currency': {
      const decimals = spec.decimals ?? 2
      const currency = spec.currency ?? CURRENCY
      return numberFormat(`c:${currency}:${decimals}`, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(n)
    }
    case 'percent': {
      const decimals = spec.decimals ?? 1
      // Values arrive as percentage points (12.5 → "12.5%"), not fractions,
      // because that is how every compute function naturally produces them.
      return `${n.toFixed(decimals)}%`
    }
    case 'decimal': {
      const decimals = spec.decimals ?? 2
      const text = numberFormat(`d:${decimals}`, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(n)
      return spec.unit ? `${text} ${spec.unit}` : text
    }
    case 'duration':
      return formatDuration(n, spec.from)
  }
}

export function formatQuantity(q: Quantity): FormattedQuantity {
  return { label: q.label, text: formatValue(q.value, q.format), value: q.value, format: q.format }
}
