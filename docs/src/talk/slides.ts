import type { Section, Slide } from "./types";

/**
 * The talk.
 *
 * It opens on a job, not on a framework: a clinic has asked for a system, here is what it
 * needs, and here are two developers building it. The comparison is per table rather than
 * one grand before-and-after, because the gap is not impressive once — it is impressive
 * seven times.
 *
 * Every command here was run. The line counts are `wc -l` of what came out. If a number
 * changes, change it here rather than saying something different on stage.
 */
export const sections: Section[] = [
  { id: "cover", title: "The job", blurb: "A clinic has asked for a system. Monday morning." },
  { id: "sec-tables", title: "The tables", blurb: "Seven of them. This is the actual work." },
  { id: "sec-two", title: "Two developers", blurb: "The same table, built twice, side by side." },
  { id: "sec-commands", title: "The commands", blurb: "Seven lines, derived from the seven tables." },
  { id: "sec-out", title: "What came out", blurb: "Worth reading, because you own all of it." },
  { id: "sec-fields", title: "Three fields", blurb: "Money, a photo, and one that only sometimes applies." },
  { id: "sec-own", title: "What you own", blurb: "And what still gets fixed for you." },
  { id: "sec-deploy", title: "Running it", blurb: "Two platforms, one description." },
  { id: "scorecard", title: "The accounting", blurb: "What you did not have to build, and what is missing." },
];

export const slides: Slide[] = [
  // ─── The job ────────────────────────────────────────────────────────────────
  {
    id: "cover",
    kind: "cover",
    event: "JS Meetup · 2026",
    title: "Flare",
    tagline: "A clinic needs a system by Friday. Two developers, same brief, same room.",
    speaker: "Muke JohnBaptist",
  },
  {
    id: "the-ask",
    kind: "list",
    eyebrow: "Monday morning · pick one",
    items: [
      { code: "01", label: "A clinic management system" },
      { code: "02", label: "A school: students, fees, results" },
      { code: "03", label: "Stock control for a hardware shop" },
      { code: "04", label: "Rentals: units, tenants, leases" },
      { code: "05", label: "An agency's clients and invoices" },
    ],
  },
  {
    id: "pick",
    kind: "statement",
    eyebrow: "We will build this one",
    title: "A clinic management system.",
    body: "Everyone in this room has sat in a waiting room, so nobody has to be told what a patient or an appointment is. We can spend the whole hour on the building instead.",
  },
  {
    id: "brief",
    kind: "split",
    eyebrow: "What the clinic actually asked for",
    left: {
      heading: "In their words",
      items: ["register a patient, with a photo", "book them with a doctor", "write up what happened in the visit", "prescribe something", "bill them", "take the money, sometimes via insurance"],
    },
    right: {
      heading: "What they did not say",
      items: ["who is allowed to see a patient record", "what happens when the receptionist leaves", "that a cancelled appointment needs a reason", "that insurance needs a claim number", "that the money must not drift"],
    },
    caption: "The left column is the quote. The right column is what the project is actually judged on, and none of it is in the brief.",
  },

  // ─── The tables ─────────────────────────────────────────────────────────────
  { id: "sec-tables", kind: "section", part: "Part one", title: "The tables", note: "Before a line of code. Get these right and the rest is typing." },
  {
    id: "tables-all",
    kind: "table",
    eyebrow: "Seven tables",
    title: "The whole system",
    head: ["Table", "What it holds", "Hangs off"],
    rows: [
      ["patients", "the person, and their photo", "—"],
      ["doctors", "who sees them, and their licence", "—"],
      ["appointments", "a booking at a time, with a status", "patient, doctor"],
      ["visits", "what actually happened", "appointment"],
      ["prescriptions", "what was given, and how often", "visit"],
      ["invoices", "what it costs", "patient, visit"],
      ["payments", "what was paid, and how", "invoice"],
    ],
    caption: "A chain: a patient is booked, the booking becomes a visit, the visit produces a prescription and an invoice, the invoice is paid. Every arrow is a foreign key.",
  },
  {
    id: "table-patient",
    kind: "table",
    eyebrow: "Table one",
    title: "patients",
    head: ["Column", "Type", "Why"],
    rows: [
      ["name", "text, required", "—"],
      ["phone", "text, unique", "how the clinic reaches them; no two patients share one"],
      ["dateOfBirth", "date", "a paediatric dose depends on it"],
      ["sex", "female | male", "a closed list, not free text"],
      ["nationalId", "text, optional", "not everyone has one on them"],
      ["photo", "image, max 5MB", "the receptionist matches a face to a file"],
      ["allergies", "long text, optional", "the one field a doctor reads first"],
    ],
  },
  {
    id: "table-appointment",
    kind: "table",
    eyebrow: "Table three · the interesting one",
    title: "appointments",
    head: ["Column", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "—"],
      ["doctorId", "→ doctors", "—"],
      ["scheduledFor", "date and time", "—"],
      ["reason", "text", "what they say on the phone"],
      ["status", "booked | arrived | seen | cancelled | noShow", "the whole front desk runs on this"],
      ["cancelledBecause", "text — **only when cancelled**", "an empty reason on a cancellation is a complaint waiting to happen"],
    ],
    caption: "That last row is the one the brief did not mention and the clinic manager will ask for in week two.",
  },
  {
    id: "table-money",
    kind: "table",
    eyebrow: "Tables six and seven",
    title: "invoices · payments",
    head: ["Column", "Type", "Why"],
    rows: [
      ["amount", "money", "not a float — three 7p items come to 0.21000000000000002"],
      ["status", "draft | sent | paid | overdue", "—"],
      ["method", "cash | mobileMoney | card | insurance", "a Ugandan clinic takes all four"],
      ["claimNumber", "text — **only when insurance**", "useless on a cash payment, and required on a claim"],
    ],
    caption: "Two tables, two fields that only sometimes apply, and one that must not be stored in a float. None of this is exotic; all of it is where projects go wrong.",
  },

  // ─── Two developers ─────────────────────────────────────────────────────────
  { id: "sec-two", kind: "section", part: "Part two", title: "Two developers,<br>same table", note: "Same brief. Same room. We'll do this seven times." },
  {
    id: "vs-patient",
    kind: "split",
    eyebrow: "patients · the first table",
    left: {
      heading: "Next.js, by hand",
      items: [
        "the Prisma model, and a migration",
        "a Zod schema for create",
        "another for update, all optional",
        "GET and POST route handlers",
        "GET, PATCH, PUT, DELETE for one",
        "a table with sort, filter, paging",
        "a form, and a second for editing",
        "upload: a bucket, a signed URL, a size check",
        "and a check on what is in the file",
      ],
      note: "11 files · 268 lines",
    },
    right: { heading: "Flare", items: ["one command"], note: "1 line" },
    caption: "Both numbers are real: 268 is `wc -l` of what Flare wrote for patients, which is what the other developer types.",
  },
  {
    id: "vs-patient-cmd",
    kind: "code",
    eyebrow: "patients · the Flare side, in full",
    lang: "bash",
    code: `npx flare gen resource Patient --icon user-round --group Clinic \\
  --fields 'name:string!, phone:tel!, dateOfBirth:date,
            sex:enum(female,male), nationalId:string?,
            photo:file:[image]:5mb?, allergies:text?, address:string?'`,
    caption: "`file:[image]:5mb` is the bucket, the signed URL, the size cap and the leading-bytes check — a renamed executable has the extension you asked for.",
  },
  {
    id: "vs-appointment",
    kind: "split",
    eyebrow: "appointments · where it gets interesting",
    left: {
      heading: "Next.js, by hand",
      items: [
        "everything from the last table, again",
        "two foreign keys and their indexes",
        "a `useEffect` to hide the reason field",
        "a `refine()` so the API agrees with it",
        "and the bug: switch away from cancelled",
        "and last week's reason is still in the row",
      ],
      note: "the rule now lives in three places",
    },
    right: {
      heading: "Flare",
      items: ["`cancelledBecause:string if status == cancelled`", "the form hides it", "the validator requires it", "the store clears it"],
      note: "the rule lives in one",
    },
    caption: "Hiding an input stops the form sending a value. It does not remove the value already in the row — which is why this cannot live in the form.",
  },
  {
    id: "vs-appointment-cmd",
    kind: "code",
    eyebrow: "appointments · the Flare side",
    lang: "bash",
    code: `npx flare gen resource Appointment --icon calendar-clock --group Clinic \\
  --fields 'patient:belongsTo(Patient), doctor:belongsTo(Doctor),
            scheduledFor:datetime, reason:string,
            status:enum(booked,arrived,seen,cancelled,noShow),
            cancelledBecause:string if status == cancelled'`,
    caption: "The condition is checked when you generate, not when you deploy: `cancelled` has to be one of the statuses, or it refuses to write the file.",
  },
  {
    id: "vs-money",
    kind: "split",
    eyebrow: "invoices · the one that costs money",
    left: {
      heading: "Next.js, by hand",
      items: ["`amount Float` — it is a number, after all", "the total comes out a penny short", "found when somebody reconciles a bank statement", "a migration, and a data fix, in production"],
      note: "0.07 + 0.07 + 0.07 = 0.21000000000000002",
    },
    right: {
      heading: "Flare",
      items: ["`amount:money`", "the column is an integer of minor units", "you send 1200.50 and read 1200.50", "only the column ever sees 120050"],
      note: "decided once, in the field type",
    },
  },
  {
    id: "vs-total",
    kind: "split",
    eyebrow: "Seven tables later",
    left: { heading: "Next.js, by hand", items: ["144 files", "13,534 lines", "written, reviewed, and now maintained", "before a single clinic-specific feature"], note: "and the admin panel is still last on the list" },
    right: { heading: "Flare", items: ["7 commands", "the same 144 files", "in your repository, under your name", "and an afternoon left over"], note: "`wc -l` on both sides" },
    caption: "The point is not that typing is slow. It is that those 13,534 lines are the same on every project, and none of them is the thing the clinic is paying for.",
  },

  // ─── The commands ───────────────────────────────────────────────────────────
  { id: "sec-commands", kind: "section", part: "Part three", title: "The commands", note: "Read the tables back as a line each. This is the whole build." },
  {
    id: "cmd-all",
    kind: "code",
    eyebrow: "The entire system",
    lang: "bash",
    code: `pnpm create flare-framework clinic && cd clinic
docker compose up -d

flare gen resource Patient      --fields 'name:string!, phone:tel!, …'
flare gen resource Doctor       --fields 'name:string!, email:email!, …'
flare gen resource Appointment  --fields '…, cancelledBecause:string if status == cancelled'
flare gen resource Visit        --fields '…, followUpOn:date if followUp == true'
flare gen resource Prescription --fields 'visit:belongsTo(Visit), drug:string!, …'
flare gen resource Invoice      --fields '…, amount:money, …'
flare gen resource Payment      --fields '…, claimNumber:string if method == insurance'

flare migrate && flare seed demo`,
    caption: "Seven lines, one per table, each a direct reading of the table we designed. Nothing here was invented at the keyboard.",
  },

  // ─── What came out ──────────────────────────────────────────────────────────
  { id: "sec-out", kind: "section", part: "Part four", title: "What came out", note: "Worth reading on a slide, because you are going to own all of it." },
  {
    id: "out-migration",
    kind: "code",
    eyebrow: "The migration it wrote",
    title: "migrations/0003_create_appointments.sql",
    lang: "sql",
    code: `CREATE TABLE \`appointments\` (
  \`scheduled_for\`     integer NOT NULL,
  \`status\`            text NOT NULL,
  \`cancelled_because\` text,
  FOREIGN KEY (\`patient_id\`) REFERENCES \`patients\`(\`id\`) ON DELETE restrict,
  CONSTRAINT "appointments_status_check"
    CHECK("appointments"."status" in
      ('booked','arrived','seen','cancelled','noShow'))
);`,
    caption: "`status` is NOT NULL and `cancelled_because` is not — the field is genuinely absent most of the time. The enum became a CHECK constraint, because that is where it belongs.",
  },
  {
    id: "out-route",
    kind: "code",
    eyebrow: "The route it wrote",
    title: "app/api/appointments/route.ts",
    lang: "ts",
    code: `export async function POST(request: Request) {
  const denied = await authorize({ request, resource, action: "create" });
  if (denied) return denied;
  if (crossOrigin(request)) return problem(403, "Cross-origin blocked.");

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const result = await store.create(read.body);
  return result.ok ? created(result.data) : invalid(result);
}`,
    caption: "No framework in it. Each guard is a named function, in order, and a new developer can follow the request without being told how it works.",
  },
  {
    id: "out-policy",
    kind: "code",
    eyebrow: "And the one that matters in a clinic",
    title: "policies/patient.policy.ts",
    lang: "ts",
    code: `export default definePolicy({
  resource: "Patient",
  read:   ["admin"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
});`,
    caption: "Admin-only on arrival, and the first account to sign up is the admin. A patient record open to anyone who registers is not a bug you want to find in a clinic.",
  },

  // ─── Three fields ───────────────────────────────────────────────────────────
  { id: "sec-fields", kind: "section", part: "Part five", title: "Three fields<br>worth a minute", note: "money · file · a field that only sometimes applies" },
  {
    id: "field-cond",
    kind: "split",
    eyebrow: "`if method == insurance`",
    left: { heading: "What it does", items: ["the form shows it only when it applies", "the validator requires it only when it applies", "the store nulls it when it stops applying", "the column is nullable, always"] },
    right: { heading: "Why the third one", items: ["a payment is edited from insurance to cash", "the form hides the claim number", "so the PATCH never mentions it", "and the claim number stays in the row", "attached to a cash payment, forever"] },
    caption: "Conditions are one level deep on purpose. A field depending on a field that is itself hidden makes the form guess, and there is no good guess.",
  },

  // ─── What you own ───────────────────────────────────────────────────────────
  { id: "sec-own", kind: "section", part: "Part six", title: "It is all<br>in your repo", note: "Which raises the obvious question about upgrades." },
  {
    id: "own-split",
    kind: "split",
    eyebrow: "The line is a list, not a feeling",
    left: { heading: "Flare owns", items: ["the resource store", "the query parser", "the row adapters", "password hashing", "the upload guard"], note: "rewritten by `flare update`" },
    right: { heading: "You own", items: ["your descriptors", "your policies", "your routes", "your pages", "your migrations"], note: "never touched" },
    caption: "Edit one of ours and a hash in the generated block notices. It is reported as drift and skipped — not overwritten, and not silent. A starter template cannot do this, because a fork has no way to bring you a fix.",
  },

  // ─── Running it ─────────────────────────────────────────────────────────────
  { id: "sec-deploy", kind: "section", part: "Part seven", title: "Running it", note: "The same seven descriptors, on two platforms." },
  {
    id: "deploy-two",
    kind: "split",
    eyebrow: "One description, two homes",
    left: { heading: "Cloudflare", items: ["Workers, D1, R2", "nothing to install locally", "`flare deploy`"], note: "a small clinic: £0/month" },
    right: { heading: "Next.js", items: ["Vercel, Postgres, Prisma", "`docker compose up -d`", "`flare deploy`"], note: "the default" },
    caption: "The descriptors, policies, seeds and every dashboard component are the same file on both. Only the row adapter differs — which is the part you were never going to write by hand anyway.",
  },

  // ─── The accounting ─────────────────────────────────────────────────────────
  {
    id: "scorecard",
    kind: "scorecard",
    eyebrow: "Part eight · the accounting",
    title: "What the clinic got, that nobody wrote",
    rows: [
      { code: "01", label: "Sign-in, 2FA, passkeys", answer: "Better Auth, wired, with the screens" },
      { code: "02", label: "Who can see a patient", answer: "a policy file per table, admin-only by default" },
      { code: "03", label: "Tables that page and filter", answer: "keyset cursors, capped counts" },
      { code: "04", label: "CSV out — and in", answer: "per resource, both directions" },
      { code: "05", label: "Photos that are really photos", answer: "leading bytes checked, SVG excluded" },
      { code: "06", label: "Money that adds up", answer: "whole minor units, converted at one seam" },
      { code: "07", label: "An API the next developer can read", answer: "OpenAPI 3.1 at /api/reference" },
      { code: "08", label: "Something to demo on Friday", answer: "`flare seed demo`" },
    ],
  },
  {
    id: "honest",
    kind: "split",
    eyebrow: "And the part that is not finished",
    left: { heading: "Not there yet", items: ["no multi-tenancy — one clinic per app", "no field-level permissions", "no plugin system", "realtime is Cloudflare-only"], note: "on the roadmap, publicly" },
    right: { heading: "Known costs", items: ["pre-1.0: the format can still move", "the Cloudflare stack runs on a beta runtime", "one maintainer", "181 files before you add anything"], note: "written down in the docs" },
    caption: "A framework that only lists its strengths is asking you to find the weaknesses yourself, on your own project, at your own cost.",
  },
  {
    id: "closing-statement",
    kind: "statement",
    eyebrow: "The claim",
    title: "Design the tables. Read them back as commands. Own every file that comes out.",
    body: "The tables were the work. They always were — the other 13,534 lines were just the cost of having them.",
  },
  {
    id: "close",
    kind: "cover",
    event: "Thank you",
    title: "Flare",
    tagline: "pnpm create flare-framework clinic  ·  flare-docs.codetotech.com  ·  github.com/MUKE-coder/flare-framework",
    speaker: "Muke JohnBaptist",
  },
];
