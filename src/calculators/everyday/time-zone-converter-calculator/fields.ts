import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * THE DETERMINISM CONSTRAINT SHAPES EVERY CHOICE BELOW.
 *
 * `compute` runs twice for the same inputs: once in Node when the page is built,
 * and once in the browser when the island rehydrates. The two must produce
 * character-identical output or the server-rendered result visibly flips on
 * hydration. Three consequences:
 *
 * 1. THERE IS NO "NOW". A converter that defaults to the current time is stale
 *    the moment the page is built and disagrees with the browser by however long
 *    the page sat on a CDN. The date defaults to `'today'` — which the view layer
 *    resolves at render time, and which makes `registry.test.ts` skip the
 *    stability snapshot automatically — but the TIME OF DAY is a fixed explicit
 *    value. 10:30 is a time a person plausibly wants to convert, and it is the
 *    same 10:30 in Node and in Chrome.
 *
 * 2. THE ZONE LIST IS CURATED, NOT THE FULL IANA SET. Offsets are read from the
 *    engine's own bundled tzdata via `Intl`, and Node's tzdata version and the
 *    browser's can differ. For a zone whose rules changed recently — Cairo
 *    reintroduced DST in 2023, Mexico abolished it in 2022, Iran in 2022, and
 *    Chile, Fiji, Jordan, Syria, Greenland and Kazakhstan have all moved in the
 *    last few years — two engines really can disagree, and the page really would
 *    flip. Every zone offered below has held the same rules for years, which
 *    shrinks the risk without pretending it is zero. `compute` says so in a note.
 *
 * 3. There is no `time` field kind, so the time of day is two number fields.
 *    That is not only a workaround: `hour` is the first NUMBER field, and
 *    `tests/calculators.spec.ts` finds the first number field, sets it to 1.1x
 *    its default and demands a valid but DIFFERENT result. 10 x 1.1 is 11 — a
 *    whole hour later, and a different answer. A date or a select cannot be
 *    driven that way, so a converter built from those alone would leave that
 *    check nothing to do.
 */

/**
 * The offered zones, west to east, each with the short name a person would use
 * for it in a sentence.
 *
 * Chosen for two properties at once. Between them they cover where people
 * actually schedule meetings, AND they cover every awkward case this calculator
 * has to get right:
 *
 *   - non-hour offsets: Kolkata (+05:30), Kathmandu (+05:45), Chatham (+12:45);
 *   - northern DST: New York, Los Angeles, London, Paris, Berlin, Athens;
 *   - southern DST, which runs the opposite way round the year: Sydney,
 *     Auckland, Chatham;
 *   - no DST at all inside a country that has it: Phoenix, Brisbane, Perth;
 *   - both ends of the international date line, Pago Pago (-11) and
 *     Kiritimati (+14), which are 25 hours apart and so are almost never on the
 *     same calendar date.
 *
 * `city` exists so the result can say "New York is 5 hours behind London"
 * rather than "America/New_York is...". The IANA id stays the stored value,
 * because that is what `Intl` accepts.
 */
export const ZONES = [
  { value: 'Pacific/Pago_Pago', city: 'Pago Pago', label: 'Pago Pago — Samoa Time (UTC-11)' },
  { value: 'Pacific/Honolulu', city: 'Honolulu', label: 'Honolulu — Hawaii Time (UTC-10)' },
  { value: 'America/Anchorage', city: 'Anchorage', label: 'Anchorage — Alaska Time' },
  { value: 'America/Los_Angeles', city: 'Los Angeles', label: 'Los Angeles — US Pacific Time' },
  { value: 'America/Denver', city: 'Denver', label: 'Denver — US Mountain Time' },
  { value: 'America/Phoenix', city: 'Phoenix', label: 'Phoenix — Arizona, no DST (UTC-7)' },
  { value: 'America/Chicago', city: 'Chicago', label: 'Chicago — US Central Time' },
  { value: 'America/New_York', city: 'New York', label: 'New York — US Eastern Time' },
  { value: 'America/Halifax', city: 'Halifax', label: 'Halifax — Atlantic Time' },
  { value: 'America/Sao_Paulo', city: 'Sao Paulo', label: 'Sao Paulo — Brazil, no DST (UTC-3)' },
  { value: 'UTC', city: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'Europe/London', city: 'London', label: 'London — United Kingdom (GMT / BST)' },
  { value: 'Europe/Dublin', city: 'Dublin', label: 'Dublin — Ireland' },
  { value: 'Europe/Lisbon', city: 'Lisbon', label: 'Lisbon — Portugal (WET / WEST)' },
  { value: 'Africa/Lagos', city: 'Lagos', label: 'Lagos — West Africa Time (UTC+1)' },
  { value: 'Europe/Paris', city: 'Paris', label: 'Paris — Central European Time' },
  { value: 'Europe/Berlin', city: 'Berlin', label: 'Berlin — Central European Time' },
  { value: 'Europe/Madrid', city: 'Madrid', label: 'Madrid — Central European Time' },
  { value: 'Europe/Rome', city: 'Rome', label: 'Rome — Central European Time' },
  { value: 'Europe/Athens', city: 'Athens', label: 'Athens — Eastern European Time' },
  { value: 'Africa/Johannesburg', city: 'Johannesburg', label: 'Johannesburg — SAST (UTC+2)' },
  { value: 'Africa/Nairobi', city: 'Nairobi', label: 'Nairobi — East Africa Time (UTC+3)' },
  { value: 'Europe/Moscow', city: 'Moscow', label: 'Moscow — Russia, no DST (UTC+3)' },
  { value: 'Asia/Dubai', city: 'Dubai', label: 'Dubai — Gulf Standard Time (UTC+4)' },
  { value: 'Asia/Karachi', city: 'Karachi', label: 'Karachi — Pakistan (UTC+5)' },
  { value: 'Asia/Kolkata', city: 'Kolkata', label: 'Kolkata / Mumbai — India (UTC+5:30)' },
  { value: 'Asia/Kathmandu', city: 'Kathmandu', label: 'Kathmandu — Nepal (UTC+5:45)' },
  { value: 'Asia/Dhaka', city: 'Dhaka', label: 'Dhaka — Bangladesh (UTC+6)' },
  { value: 'Asia/Bangkok', city: 'Bangkok', label: 'Bangkok — Indochina Time (UTC+7)' },
  { value: 'Asia/Jakarta', city: 'Jakarta', label: 'Jakarta — Western Indonesia (UTC+7)' },
  { value: 'Asia/Singapore', city: 'Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Shanghai', city: 'Shanghai', label: 'Shanghai / Beijing — China (UTC+8)' },
  { value: 'Asia/Hong_Kong', city: 'Hong Kong', label: 'Hong Kong (UTC+8)' },
  { value: 'Australia/Perth', city: 'Perth', label: 'Perth — Western Australia, no DST (UTC+8)' },
  { value: 'Asia/Tokyo', city: 'Tokyo', label: 'Tokyo — Japan, no DST (UTC+9)' },
  { value: 'Asia/Seoul', city: 'Seoul', label: 'Seoul — Korea, no DST (UTC+9)' },
  { value: 'Australia/Brisbane', city: 'Brisbane', label: 'Brisbane — Queensland, no DST (UTC+10)' },
  { value: 'Australia/Sydney', city: 'Sydney', label: 'Sydney — Australian Eastern Time' },
  { value: 'Pacific/Auckland', city: 'Auckland', label: 'Auckland — New Zealand' },
  { value: 'Pacific/Chatham', city: 'Chatham Islands', label: 'Chatham Islands (UTC+12:45)' },
  { value: 'Pacific/Kiritimati', city: 'Kiritimati', label: 'Kiritimati — Line Islands (UTC+14)' },
] as const satisfies ReadonlyArray<{ value: string; city: string; label: string }>

/** The IANA id → the short name used in prose. */
export const cityOf = (zone: string): string => ZONES.find((z) => z.value === zone)?.city ?? zone

const ZONE_OPTIONS = ZONES.map(({ value, label }) => ({ value, label }))

export const fields = [
  {
    kind: 'date',
    id: 'date',
    label: 'Date',
    // 'today' is resolved by the view layer at render time, so compute itself
    // never reads a clock and stays a pure function of its inputs.
    default: 'today',
    help: 'The calendar date as written in the zone you are converting FROM.',
  },
  {
    kind: 'number',
    id: 'hour',
    label: 'Hour (24-hour clock)',
    default: 10,
    min: 0,
    max: 23,
    step: 1,
    unit: 'h',
    help: '0 is midnight, 12 is noon, 23 is 11 pm. Fixed rather than “now”, so the answer never goes stale.',
  },
  {
    kind: 'number',
    id: 'minute',
    label: 'Minutes past the hour',
    default: 30,
    min: 0,
    max: 59,
    step: 1,
    unit: 'min',
    help: 'Separate from the hour because India, Nepal and the Chathams sit on half and quarter hours.',
  },
  {
    kind: 'select',
    id: 'fromZone',
    label: 'From time zone',
    default: 'America/New_York',
    options: ZONE_OPTIONS,
    help: 'The zone the date and time above are written in.',
  },
  {
    kind: 'select',
    id: 'toZone',
    label: 'To time zone',
    default: 'Europe/London',
    options: ZONE_OPTIONS,
    help: 'The zone to read that same moment in.',
  },
] as const satisfies readonly Field[]
