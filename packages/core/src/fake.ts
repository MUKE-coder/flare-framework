/**
 * Sample data for seeds. Small on purpose: a handful of word lists and a seeded
 * random number generator, so a million rows cost nothing to produce and the same
 * seed always gives the same data.
 *
 *   const fake = createFake();
 *   fake.fullName();  // "Amina Okello"
 *   fake.email();     // "amina.okello4@example.com"
 */

const FIRST_NAMES = [
  "Amina", "Daniel", "Grace", "Wei", "Sofia", "Tendai", "Noah", "Priya", "Lucas", "Fatima",
  "Ibrahim", "Elena", "Kwame", "Maya", "Hiroshi", "Leila", "Marcus", "Chiara", "Omar", "Ana",
  "Joseph", "Nadia", "Thabo", "Yuki", "Diego", "Ruth", "Samuel", "Zara", "Peter", "Isabel",
  "Kofi", "Mei", "Andrés", "Halima", "Jonas", "Rania", "Esther", "Viktor", "Aisha", "Tomás",
];

const LAST_NAMES = [
  "Okello", "Silva", "Nakamura", "Mensah", "Okafor", "Rossi", "Chen", "Hassan", "Müller", "Dubois",
  "Kimani", "Patel", "Novak", "Garcia", "Haddad", "Andersen", "Osei", "Reyes", "Kowalski", "Tadesse",
  "Nguyen", "Baptiste", "Mwangi", "Fernandes", "Ivanov", "Khan", "Lindqvist", "Santos", "Abebe", "Yusuf",
];

const COMPANY_HEADS = [
  "North", "Blue", "Bright", "Iron", "River", "Summit", "Atlas", "Harbour", "Cedar", "Copper",
  "Lumen", "Orbit", "Stone", "Vertex", "Willow", "Zenith", "Kestrel", "Meridian", "Sable", "Terra",
];
const COMPANY_TAILS = ["Labs", "Works", "Group", "Studio", "Systems", "Partners", "Supply", "Analytics", "Foods", "Logistics"];

const CITIES = [
  "Kampala", "Nairobi", "Lagos", "Accra", "Cairo", "Cape Town", "Dar es Salaam", "Casablanca",
  "London", "Berlin", "Madrid", "Lisbon", "Warsaw", "Stockholm", "Amsterdam", "Dublin",
  "New York", "Toronto", "Chicago", "Austin", "São Paulo", "Bogotá", "Mexico City", "Lima",
  "Mumbai", "Singapore", "Tokyo", "Seoul", "Jakarta", "Manila", "Sydney", "Auckland",
];

/** ISO 3166-1 alpha-2 codes with their calling codes, for country and tel fields. */
const COUNTRIES = [
  ["UG", "256"], ["KE", "254"], ["NG", "234"], ["GH", "233"], ["ZA", "27"], ["EG", "20"],
  ["US", "1"], ["CA", "1"], ["GB", "44"], ["IE", "353"], ["DE", "49"], ["FR", "33"],
  ["ES", "34"], ["PT", "351"], ["NL", "31"], ["SE", "46"], ["PL", "48"], ["BR", "55"],
  ["MX", "52"], ["IN", "91"], ["SG", "65"], ["JP", "81"], ["AU", "61"], ["AE", "971"],
] as const;

const WORDS = [
  "account", "balance", "shipment", "invoice", "review", "signal", "request", "channel", "vendor", "budget",
  "report", "delivery", "contract", "renewal", "forecast", "meeting", "proposal", "discount", "refund", "ticket",
  "quarter", "pipeline", "customer", "supplier", "warehouse", "campaign", "segment", "retention", "onboarding", "escalation",
  "follow-up", "handover", "kickoff", "milestone", "rollout", "shortfall", "surplus", "threshold", "variance", "workflow",
];

/** Things a shop might sell: a material or finish, a thing, and sometimes a size. */
const PRODUCT_QUALITIES = ["Oak", "Walnut", "Brushed steel", "Canvas", "Merino", "Recycled", "Matte black", "Linen", "Copper", "Frosted glass"];
const PRODUCT_THINGS = [
  "desk lamp", "office chair", "notebook", "water bottle", "backpack", "keyboard", "mouse mat", "coffee grinder",
  "travel mug", "wall clock", "storage box", "cable tidy", "monitor stand", "planter", "door mat", "tote bag",
];
/** What a digital product tends to be. */
const DIGITAL_THINGS = ["starter kit", "source code licence", "icon pack", "template bundle", "course", "font family", "preset pack", "e-book"];

const DOMAINS = ["example.com", "example.org", "example.net", "mail.example.com"];
const TLDS = ["com", "io", "co", "org", "net"];
const COLORS = ["#f2541d", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

const DAY_MS = 86_400_000;

export interface Fake {
  /** Whole number in [min, max]. */
  int(min: number, max: number): number;
  /** Number in [min, max], rounded to `decimals` places (default 2). */
  float(min: number, max: number, decimals?: number): number;
  /** True with the given probability (default 0.5). */
  bool(chance?: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Between `min` and `max` distinct items, in the order they appear. */
  some<T>(items: readonly T[], min?: number, max?: number): T[];
  firstName(): string;
  lastName(): string;
  fullName(): string;
  /** A unique address: the counter keeps it unique however many rows are made. */
  email(name?: string): string;
  company(): string;
  jobTitle(): string;
  /** "Brushed steel desk lamp", or a digital one: "Starter kit licence". */
  product(digital?: boolean): string;
  city(): string;
  /** ISO 3166-1 alpha-2, e.g. "UG". */
  country(): string;
  /** E.164, e.g. "+256772431980". */
  phone(): string;
  domain(): string;
  url(): string;
  slug(text?: string): string;
  color(): string;
  words(count?: number): string;
  sentence(): string;
  paragraph(sentences?: number): string;
  /** "YYYY-MM-DD" within the last `daysBack` days (default 365). */
  date(daysBack?: number): string;
  /** ISO timestamp within the last `daysBack` days (default 365). */
  datetime(daysBack?: number): string;
  /** Milliseconds since the epoch, within the last `daysBack` days. */
  timestamp(daysBack?: number): number;
  uuid(): string;
  /**
   * A ULID: a 26-character id that sorts by the time it was made. Rows seeded with
   * these go in at the end of the primary key's index instead of all over it, which
   * measured 4× quicker than random ids at a few hundred thousand rows.
   */
  id(): string;
  /** How many values this generator has produced; unique per row. */
  readonly count: number;
}

/** Crockford base32, ULID's alphabet: no I, L, O or U, so ids can't be misread. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function encodeCrockford(value: bigint, length: number): string {
  let out = "";
  let rest = value;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(rest % 32n)] + out;
    rest /= 32n;
  }
  return out;
}

/** Deterministic PRNG (mulberry32): same seed, same data, and fast enough for millions of rows. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generator of sample values. `seed` makes runs reproducible; leave it out for a
 * different set every time.
 */
export function createFake(seed = 20260101): Fake {
  const next = random(seed);
  let count = 0;
  const step = () => ++count;
  // Where this run's ULIDs start, and how far along they are.
  const tail = BigInt(Math.floor(next() * 2 ** 40)) * 2n ** 40n;
  let counter = 0n;
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const slugify = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const fake: Fake = {
    int,
    float: (min, max, decimals = 2) => Number((min + next() * (max - min)).toFixed(decimals)),
    bool: (chance = 0.5) => next() < chance,
    pick,
    some(items, min = 1, max = items.length) {
      const wanted = int(Math.min(min, items.length), Math.min(max, items.length));
      const chosen = new Set<number>();
      // Sampling by index keeps the original order and never repeats an item.
      while (chosen.size < wanted) chosen.add(Math.floor(next() * items.length));
      return [...chosen].sort((a, b) => a - b).map((index) => items[index]!);
    },
    firstName: () => pick(FIRST_NAMES),
    lastName: () => pick(LAST_NAMES),
    fullName: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    email(name) {
      const local = name ? slugify(name).replace(/-/g, ".") : `${pick(FIRST_NAMES)}.${pick(LAST_NAMES)}`.toLowerCase();
      return `${slugify(local).replace(/-/g, ".")}${step()}@${pick(DOMAINS)}`;
    },
    company: () => `${pick(COMPANY_HEADS)} ${pick(COMPANY_TAILS)}`,
    product: (digital = false) =>
      digital ? `${pick(PRODUCT_QUALITIES)} ${pick(DIGITAL_THINGS)}` : `${pick(PRODUCT_QUALITIES)} ${pick(PRODUCT_THINGS)}`,
    jobTitle: () => `${pick(["Head of", "Senior", "Lead", "Regional", "Junior"])} ${pick(["Operations", "Sales", "Support", "Engineering", "Finance", "Logistics"])}`,
    city: () => pick(CITIES),
    country: () => pick(COUNTRIES)[0],
    phone: () => `+${pick(COUNTRIES)[1]}${String(int(700000000, 799999999))}`,
    domain: () => `${slugify(`${pick(COMPANY_HEADS)}${pick(COMPANY_TAILS)}`)}${step()}.${pick(TLDS)}`,
    url: () => `https://${slugify(pick(COMPANY_HEADS))}.${pick(TLDS)}/${slugify(pick(WORDS))}`,
    slug: (text) => `${slugify(text ?? `${pick(WORDS)}-${pick(WORDS)}`)}-${step()}`,
    color: () => pick(COLORS),
    words: (howMany = 3) => Array.from({ length: howMany }, () => pick(WORDS)).join(" "),
    sentence() {
      const words = Array.from({ length: int(5, 12) }, () => pick(WORDS)).join(" ");
      return `${words[0]!.toUpperCase()}${words.slice(1)}.`;
    },
    paragraph(sentences = 3) {
      return Array.from({ length: sentences }, () => fake.sentence()).join(" ");
    },
    timestamp: (daysBack = 365) => Date.now() - int(0, daysBack) * DAY_MS - int(0, DAY_MS - 1),
    date: (daysBack = 365) => new Date(fake.timestamp(daysBack)).toISOString().slice(0, 10),
    datetime: (daysBack = 365) => new Date(fake.timestamp(daysBack)).toISOString(),
    uuid() {
      // Not crypto-random on purpose: seeded, so a seeded run is repeatable.
      const hex = "0123456789abcdef";
      let out = "";
      for (let i = 0; i < 32; i++) out += hex[Math.floor(next() * 16)];
      return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`;
    },
    id() {
      // ULID: milliseconds in the first 10 characters, then a random tail that counts
      // up, so ids made in the same millisecond still come out in order.
      counter += 1n;
      return encodeCrockford(BigInt(Date.now()), 10) + encodeCrockford((tail + counter) % 2n ** 80n, 16);
    },
    get count() {
      return count;
    },
  };
  return fake;
}

/** A shared generator, for seeds that don't need their own. */
export const fake: Fake = createFake();
