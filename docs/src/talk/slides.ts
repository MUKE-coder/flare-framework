import type { Slide } from "./types";

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

export const slides: Slide[] = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: "title",
    kind: "cover",
    event: "JS Meetup · 2026",
    title: "Flare Framework",
    tagline: "The fastest way to ship a full-stack app on Next.js or Cloudflare.",
    speaker: "Muke JohnBaptist · Desishub",
  },
  {
    id: "not-a-framework",
    kind: "statement",
    eyebrow: "Except",
    title: 'Flare, the <span style="text-decoration:line-through;text-decoration-thickness:6px;opacity:0.45">framework</span>',
    body: "Next.js and Cloudflare, with the boilerplate already written — into **your** repository, under your name. There is nothing of Flare left in the route handler. You could delete the CLI tomorrow and the app would still build.",
  },
  {
    id: "me",
    kind: "portrait",
    eyebrow: "Who is saying this",
    name: "Muke JohnBaptist",
    image: "/talk/jb-portrait.webp",
    role: "Fullstack engineer · Founder, Desishub Technologies · Kampala",
    facts: [
      "150+ client projects shipped across four countries",
      "`DGateway` — MTN, Airtel and Stripe payments, ~4k transactions a day",
      "`Grit`, the Go framework this talk's sibling was about",
      "JB WEB DEVELOPER on YouTube — Next.js, Go, Docker, DevOps",
    ],
    links: "github.com/MUKE-coder · @JBWEBDEVELOPER · jb.desishub.com",
  },

  // ─── Why another one ────────────────────────────────────────────────────────
  { id: "sec-why", kind: "section", part: "First", title: "Why build<br>another one?", note: "Two questions for the room before I answer that." },
  {
    id: "q-next",
    kind: "statement",
    eyebrow: "Hands up",
    title: "Who here builds with Next.js?",
    body: "Keep them up.",
  },
  {
    id: "q-vercel",
    kind: "statement",
    eyebrow: "Second question",
    title: "And who is quietly nervous about the Vercel bill?",
    body: "That gap, between the first show of hands and the second, is most of why this talk exists.",
  },
  {
    id: "love-next",
    kind: "split",
    eyebrow: "Why we reach for it",
    left: {
      heading: "Next.js gets a lot right",
      items: ["routing you do not configure", "server and client in one file", "the best React story there is", "every tutorial assumes it", "hiring is easy"],
    },
    right: {
      heading: "And the worry is not the code",
      items: ["pricing that scales with success", "a bill that surprises on a good month", "egress you did not think about", "one vendor holding the deploy", "“what if we need to leave?”"],
    },
    caption: "Nobody is nervous about the framework. They are nervous about where it has to run.",
  },
  {
    id: "vinext",
    kind: "statement",
    eyebrow: "And now",
    title: "Next.js is arriving on Cloudflare.",
    body: "`vinext` runs a Next-compatible app on Workers — D1, R2, KV, no cold starts, and a bill that does not move much. It is beta, and it is the first real answer to the second show of hands.",
  },
  {
    id: "setup-tax",
    kind: "statement",
    eyebrow: "But",
    title: "Both are excellent, and both leave you the same fortnight of work.",
    body: "Auth. A database. Uploads. An admin panel. A table that sorts, filters and pages. CSV. Roles. A deploy. None of it is the thing the client is paying for, and all of it is billed to you.",
  },
  {
    id: "the-tax",
    kind: "statement",
    eyebrow: "Call it what it is",
    title: "The setup tax.",
    body: "You pay it on every project, you pay it in full every time, and no estimate you have ever written included it honestly.",
  },

  // ─── A real job ─────────────────────────────────────────────────────────────
  { id: "sec-job", kind: "section", part: "So", title: "Take a real job", note: "Monday morning. A client, a brief, a date." },
  {
    id: "the-ask",
    kind: "list",
    eyebrow: "The kind of thing you actually get asked for",
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
    body: "Everyone in this room has sat in a waiting room, so nobody needs telling what a patient or an appointment is. We can spend the hour on the building instead.",
  },
  {
    id: "hustle-1",
    kind: "focus",
    eyebrow: "What most of us do",
    active: "01",
    items: [
      { code: "01", label: "Open the last project" },
      { code: "02", label: "Hunt for a template" },
      { code: "03", label: "Wire the auth, again" },
      { code: "04", label: "Rebuild the same table" },
      { code: "05", label: "Leave the admin for last" },
      { code: "06", label: "Quote two weeks you cannot bill" },
    ],
    title: "You open the last project<br>and start pasting.",
    body: "Auth. Uploads. Email. You wrote them already — and writing a session refresh from scratch a sixth time is worse than copying it. Right up until the copy and the original disagree.",
  },
  {
    id: "hustle-2",
    kind: "focus",
    eyebrow: "What most of us do",
    active: "02",
    items: [
      { code: "01", label: "Open the last project" },
      { code: "02", label: "Hunt for a template" },
      { code: "03", label: "Wire the auth, again" },
      { code: "04", label: "Rebuild the same table" },
      { code: "05", label: "Leave the admin for last" },
      { code: "06", label: "Quote two weeks you cannot bill" },
    ],
    title: "Or you buy a template,<br>and inherit a fork.",
    body: "It is right once, on the day you clone it. Six months later upstream fixes a session bug and there is no mechanism that brings it to you.",
  },
  {
    id: "hustle-3",
    kind: "focus",
    eyebrow: "What most of us do",
    active: "05",
    items: [
      { code: "01", label: "Open the last project" },
      { code: "02", label: "Hunt for a template" },
      { code: "03", label: "Wire the auth, again" },
      { code: "04", label: "Rebuild the same table" },
      { code: "05", label: "Leave the admin for last" },
      { code: "06", label: "Quote two weeks you cannot bill" },
    ],
    title: "And the admin panel<br>goes in last.",
    body: "No estimate includes it, so it is built by whoever is free, on the last Friday — and it is the screen the client actually spends their day in.",
  },
  {
    id: "lets-see",
    kind: "statement",
    eyebrow: "So",
    title: "Let's build it instead.",
    body: "Same brief, same room. One of us does the fortnight. The other describes seven tables.",
  },

  // ─── The tables ─────────────────────────────────────────────────────────────
  { id: "sec-tables", kind: "section", part: "Part one", title: "The tables", note: "Before a line of code. Get these right and the rest is typing." },
  {
    id: "tables-all",
    kind: "cards",
    eyebrow: "Seven tables",
    title: "The whole system",
    cards: [
      { num: "01", name: "patients", note: "The person, and their photo" },
      { num: "02", name: "doctors", note: "Who sees them, and their licence" },
      { num: "03", name: "appointments", note: "A booking at a time, with a status", hangs: "patient · doctor" },
      { num: "04", name: "visits", note: "What actually happened", hangs: "appointment" },
      { num: "05", name: "prescriptions", note: "What was given, and how often", hangs: "visit" },
      { num: "06", name: "invoices", note: "What it costs", hangs: "patient · visit" },
      { num: "07", name: "payments", note: "What was paid, and how", hangs: "invoice" },
    ],
    caption: "A chain. A patient is booked, the booking becomes a visit, the visit produces a prescription and an invoice, the invoice is paid.",
  },
  {
    id: "table-patient",
    kind: "table",
    eyebrow: "01 · patients",
    title: "The person",
    head: ["Field", "Type", "Why"],
    rows: [
      ["name", "text, required", "—"],
      ["phone", "text, unique", "how the clinic reaches them"],
      ["dateOfBirth", "date", "a paediatric dose depends on it"],
      ["sex", "female | male", "a closed list, not free text"],
      ["photo", "image, max 5MB", "the receptionist matches a face to a file"],
      ["allergies", "long text, optional", "the field a doctor reads first"],
    ],
  },
  {
    id: "table-doctor",
    kind: "table",
    eyebrow: "02 · doctors",
    title: "Who sees them",
    head: ["Field", "Type", "Why"],
    rows: [
      ["name", "text, required", "—"],
      ["email", "email, unique", "one account per doctor"],
      ["specialty", "a closed list of five", "drives who can be booked for what"],
      ["licenceNumber", "text, unique", "a clinic is inspected on this"],
      ["active", "true | false", "a locum leaves; the history stays"],
    ],
  },
  {
    id: "table-appointment",
    kind: "table",
    eyebrow: "03 · appointments · the interesting one",
    title: "The booking",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "restrict: you cannot delete a booked patient"],
      ["doctorId", "→ doctors", "—"],
      ["scheduledFor", "date and time", "—"],
      ["status", "booked | arrived | seen | cancelled | noShow", "the front desk runs on this"],
      ["cancelledBecause", "text — **only when cancelled**", "an empty reason is a complaint waiting to happen"],
    ],
    caption: "The last row is the one the brief did not mention and the clinic manager asks for in week two.",
  },
  {
    id: "table-visit",
    kind: "table",
    eyebrow: "04 · visits",
    title: "What happened",
    head: ["Field", "Type", "Why"],
    rows: [
      ["appointmentId", "→ appointments", "a visit only exists for a booking"],
      ["complaint", "long text", "in the patient's words"],
      ["diagnosis", "text", "in the doctor's"],
      ["followUp", "true | false", "—"],
      ["followUpOn", "date — **only when followUp**", "a date on a visit needing no follow-up is noise"],
    ],
  },
  {
    id: "table-money",
    kind: "table",
    eyebrow: "06 · 07 · invoices and payments",
    title: "The money",
    head: ["Field", "Type", "Why"],
    rows: [
      ["amount", "money", "not a float — three 7p items come to 0.21000000000000002"],
      ["status", "draft | sent | paid | overdue", "—"],
      ["method", "cash | mobileMoney | card | insurance", "a Ugandan clinic takes all four"],
      ["claimNumber", "text — **only when insurance**", "useless on cash, required on a claim"],
    ],
    caption: "Two fields that only sometimes apply, and one that must not be a float. None of it exotic; all of it where projects go wrong.",
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
