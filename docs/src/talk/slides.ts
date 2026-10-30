import type { Slide } from "./types";

/**
 * The talk.
 *
 * Eighty-some slides, one idea each. The first third builds the problem — the fortnight
 * of setup, and the three habits we cope with it — before Flare is argued for at all.
 * Then a real job: a clinic, its seven tables, and two developers building the same
 * thing. The comparison runs per table rather than one grand before-and-after, because
 * the gap is not impressive once — it is impressive seven times. The position lands in
 * part six: not a dependency, not a template, not a low-code tool.
 *
 * Every command here was run. The line counts are `wc -l` of what came out. If a number
 * changes, change it here rather than saying something different on stage.
 *
 * Note on formatting: eyebrows render as plain text (no backticks); statement and focus
 * titles render as raw HTML; everything else goes through the tiny md() in talk.astro.
 */

const FORTNIGHT = [
  { code: "01", label: "Auth: sign-up, reset, sessions, 2FA" },
  { code: "02", label: "A database, and its migrations" },
  { code: "03", label: "File uploads, done safely" },
  { code: "04", label: "An admin panel" },
  { code: "05", label: "A table: sort, filter, page" },
  { code: "06", label: "CSV out — and in" },
  { code: "07", label: "Roles and permissions" },
  { code: "08", label: "The deploy" },
];

const HABITS = [
  { code: "01", label: "Open the last project" },
  { code: "02", label: "Buy a template" },
  { code: "03", label: "Leave the admin for last" },
];

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
    body: "Next.js and Cloudflare, with the boilerplate already written — into **your** repository, under your name. You could delete the CLI tomorrow and the app would still build.",
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
  {
    id: "map",
    kind: "list",
    eyebrow: "Where this goes",
    items: [
      { code: "01", label: "The problem, honestly" },
      { code: "02", label: "A real job: a clinic" },
      { code: "03", label: "The tables" },
      { code: "04", label: "Two developers, same table" },
      { code: "05", label: "What the generator wrote" },
      { code: "06", label: "What you own" },
      { code: "07", label: "Running it" },
      { code: "08", label: "The accounting" },
    ],
  },

  // ─── Act one · the problem ──────────────────────────────────────────────────
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
    body: "Keep those up too.",
  },
  {
    id: "the-gap",
    kind: "statement",
    eyebrow: "Look around",
    title: "That gap is this talk.",
    body: "Almost every hand that went up the first time stayed up the second. We love the framework. We are nervous about where it has to run.",
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
  },
  {
    id: "vinext",
    kind: "statement",
    eyebrow: "And now",
    title: "Next.js is arriving on Cloudflare.",
    body: "`vinext` runs a Next-compatible app on Workers — D1, R2, KV, no cold starts, and a bill that does not move much. It is beta, and it is real.",
  },
  {
    id: "half-answer",
    kind: "statement",
    eyebrow: "Progress",
    title: "So the hosting worry has an answer.",
    body: "One of the two problems, down. The second one is older, and no platform fixes it.",
  },
  {
    id: "same-fortnight",
    kind: "statement",
    eyebrow: "Because",
    title: "Pick either platform. You still start the same fortnight.",
    body: "Neither Next.js nor Cloudflare writes the part every client project begins with.",
  },
  {
    id: "fortnight",
    kind: "list",
    eyebrow: "The fortnight, itemised",
    items: FORTNIGHT,
  },
  {
    id: "fort-auth",
    kind: "focus",
    eyebrow: "Take them one at a time",
    items: FORTNIGHT,
    active: "01",
    title: "Auth is a week<br>you have written five times.",
    body: "Sign-up, reset emails, sessions, two-factor. Identical on every project — and dangerous on every project, because auth is the one place a shortcut becomes a headline.",
  },
  {
    id: "fort-uploads",
    kind: "focus",
    eyebrow: "Take them one at a time",
    items: FORTNIGHT,
    active: "03",
    title: "Uploads are never<br>just uploads.",
    body: "A bucket. A signed URL. A size cap. And a check on what is actually in the file — because an `.exe` renamed to `.jpg` has exactly the extension you asked for.",
  },
  {
    id: "fort-admin",
    kind: "focus",
    eyebrow: "Take them one at a time",
    items: FORTNIGHT,
    active: "04",
    title: "The admin panel<br>is the app.",
    body: "It is the screen your client spends their working day in. And it is the one thing on this list that no estimate ever includes.",
  },
  {
    id: "fort-table",
    kind: "focus",
    eyebrow: "Take them one at a time",
    items: FORTNIGHT,
    active: "05",
    title: "And the table<br>is the same table.",
    body: "Sort, filter, paging, an empty state, a loading state. You have built it for products, for students, for tenants. It is always the same table.",
  },
  {
    id: "the-tax",
    kind: "statement",
    eyebrow: "Call it what it is",
    title: "The setup tax.",
    body: "Paid on every project. Paid in full, every time.",
  },
  {
    id: "tax-honest",
    kind: "statement",
    eyebrow: "And be honest",
    title: "No estimate you ever wrote included it.",
    body: "The quote says “clinic management system”. The first two weeks of the invoice are auth, a table, and an upload form — again.",
  },

  // ─── Act one, part two · how we cope ────────────────────────────────────────
  { id: "sec-cope", kind: "section", part: "Second", title: "How we cope", note: "Three habits. Each one rational. Each one a trap." },
  {
    id: "cope-copy",
    kind: "focus",
    eyebrow: "Habit one",
    items: HABITS,
    active: "01",
    title: "You open the last project<br>and start pasting.",
    body: "Auth, uploads, email. You wrote them already — and writing a session refresh from scratch a sixth time is worse than copying it.",
  },
  {
    id: "copy-drift",
    kind: "statement",
    eyebrow: "The catch",
    title: "Now the bug lives in four projects.",
    body: "You fixed the session refresh in March. In one of them. The other three are in production, and nothing on earth connects them.",
  },
  {
    id: "cope-template",
    kind: "focus",
    eyebrow: "Habit two",
    items: HABITS,
    active: "02",
    title: "Or you buy a template,<br>and inherit a fork.",
    body: "It has auth. It has a dashboard. It is correct on the day you clone it.",
  },
  {
    id: "template-fork",
    kind: "statement",
    eyebrow: "The catch",
    title: "A template is a fork with no upstream.",
    body: "Six months later the author fixes a session bug — and there is no mechanism, none, that brings that fix to you. You stripped half of it anyway.",
  },
  {
    id: "cope-admin",
    kind: "focus",
    eyebrow: "Habit three",
    items: HABITS,
    active: "03",
    title: "And the admin panel<br>goes in last.",
    body: "Built by whoever is free, on the last Friday, out of whatever components are lying around.",
  },
  {
    id: "admin-last",
    kind: "statement",
    eyebrow: "The catch",
    title: "The least-designed screen gets the most use.",
    body: "The client does not live on your landing page. They live in the admin — the part that got one Friday.",
  },
  {
    id: "cope-cost",
    kind: "statement",
    eyebrow: "Add it up",
    title: "None of it is the thing the client is paying for.",
    body: "They are paying for a clinic that runs. The fortnight is overhead — and it is billed to you.",
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
    id: "the-brief",
    kind: "statement",
    eyebrow: "The brief",
    title: "Patients. Bookings. Visits. Prescriptions. Invoices.",
    body: "Four weeks. And a clinic manager who will phone, in week two, about the thing the brief forgot.",
  },
  {
    id: "two-devs",
    kind: "statement",
    eyebrow: "The experiment",
    title: "Let's build it twice.",
    body: "Same brief, same room. One of us does the fortnight by hand. The other describes tables.",
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
  },
  {
    id: "the-chain",
    kind: "statement",
    eyebrow: "Read it as a story",
    title: "Booked. Seen. Prescribed. Invoiced. Paid.",
    body: "A patient is booked; the booking becomes a visit; the visit produces a prescription and an invoice; the invoice is paid. Seven tables, one chain.",
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
    eyebrow: "03 · appointments",
    title: "The booking",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "restrict: you cannot delete a booked patient"],
      ["doctorId", "→ doctors", "—"],
      ["scheduledFor", "date and time", "—"],
      ["status", "booked | arrived | seen | cancelled | noShow", "the front desk runs on this"],
      ["cancelledBecause", "text — **only when cancelled**", "an empty reason is a complaint waiting to happen"],
    ],
  },
  {
    id: "appt-cancel",
    kind: "statement",
    eyebrow: "That last row",
    title: "The field the brief forgot.",
    body: "Nobody asks for `cancelledBecause` in week zero. The clinic manager asks for it in week two, after the first argument at the front desk. Design it now and it is one line.",
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
    id: "table-prescription",
    kind: "table",
    eyebrow: "05 · prescriptions",
    title: "What was given",
    head: ["Field", "Type", "Why"],
    rows: [
      ["visitId", "→ visits", "a prescription belongs to a visit"],
      ["drug", "text, required", "—"],
      ["dosage", "text", "in units the pharmacist reads"],
      ["frequency", "text", "“1 × 3, after meals”"],
      ["days", "number", "how long the course runs"],
    ],
  },
  {
    id: "table-invoice",
    kind: "table",
    eyebrow: "06 · invoices",
    title: "What it costs",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "—"],
      ["visitId", "→ visits", "an invoice bills a visit"],
      ["amount", "money", "**not a float** — more on this shortly"],
      ["status", "draft | sent | paid | overdue", "—"],
    ],
  },
  {
    id: "table-payment",
    kind: "table",
    eyebrow: "07 · payments",
    title: "What was paid, and how",
    head: ["Field", "Type", "Why"],
    rows: [
      ["invoiceId", "→ invoices", "—"],
      ["amount", "money", "partial payments are normal"],
      ["method", "cash | mobileMoney | card | insurance", "a Ugandan clinic takes all four"],
      ["claimNumber", "text — **only when insurance**", "useless on cash, required on a claim"],
    ],
  },
  {
    id: "three-traps",
    kind: "statement",
    eyebrow: "Hiding in those seven tables",
    title: "Three traps. All of them ordinary.",
    body: "Money that must not be a float. Files that must really be images. Fields that only sometimes apply. Hold those three — they come back.",
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
      ],
      note: "11 files · 268 lines",
    },
    right: { heading: "Flare", items: ["one command"], note: "1 line" },
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
  },
  {
    id: "patient-bought",
    kind: "statement",
    eyebrow: "What that one line is",
    title: "The schema. The migration. The validators. The API. The client. Four admin pages.",
    body: "268 lines, written into your repository. Both numbers are `wc -l`, not a brochure.",
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
      items: ["`cancelledBecause:string if status == cancelled`"],
      note: "the rule lives in one",
    },
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
    id: "rule-one",
    kind: "statement",
    eyebrow: "The difference that matters",
    title: "One declaration. Three behaviours. Zero disagreements.",
    body: "The form hides the field. The validator requires it. The store clears it when the status moves on. They cannot drift apart, because they are the same line.",
  },
  {
    id: "float-fail",
    kind: "statement",
    eyebrow: "invoices · by hand",
    title: "0.07 + 0.07 + 0.07 = 0.21000000000000002",
    body: "`amount Float` — it is a number, after all. Found months later, by whoever reconciles the bank statement. Fixed with a migration and a data repair, in production.",
  },
  {
    id: "vs-money",
    kind: "split",
    eyebrow: "invoices · the one that costs money",
    left: {
      heading: "Next.js, by hand",
      items: ["`amount Float`", "the total comes out a penny short", "found at bank reconciliation", "a migration and a data fix, live"],
      note: "the bug ships silently",
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
    left: {
      heading: "Next.js, by hand",
      items: ["144 files", "13,534 lines", "written, reviewed, and now maintained", "before a single clinic-specific feature"],
      note: "and the admin panel is still last on the list",
    },
    right: {
      heading: "Flare",
      items: ["7 commands", "the same 144 files", "in your repository, under your name", "and an afternoon left over"],
      note: "`wc -l` on both sides",
    },
  },
  {
    id: "not-typing",
    kind: "statement",
    eyebrow: "To be clear",
    title: "The point is not that typing is slow.",
    body: "It is that those 13,534 lines are the same on every project — and none of them is the thing the clinic is paying for.",
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
  },
  {
    id: "nothing-invented",
    kind: "statement",
    eyebrow: "Look at it again",
    title: "It is the table design, read back as lines.",
    body: "Nothing on that slide was invented at the keyboard. The design work was the work. It always was.",
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
    caption: "The enum became a CHECK constraint, because that is where it belongs. And you cannot delete a patient who has a booking.",
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
  },
  {
    id: "route-readable",
    kind: "statement",
    eyebrow: "Worth noticing",
    title: "There is no framework in that route.",
    body: "Each guard is a named function, in order. Ctrl-click `createResourceStore` and you land in your own repository — not in `node_modules`.",
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
  },
  {
    id: "policy-default",
    kind: "statement",
    eyebrow: "Secure on arrival",
    title: "Admin-only, before you thought about it.",
    body: "The first account to sign up becomes the admin. A patient record open to anyone who registers is not a bug you want to find in a clinic.",
  },
  {
    id: "out-admin",
    kind: "statement",
    eyebrow: "And the panel",
    title: "The admin came first this time.",
    body: "A sortable table, a multi-step form, a record page and loading skeletons — per table, generated with the API. Not left for the last Friday.",
  },

  // ─── Three fields ───────────────────────────────────────────────────────────
  { id: "sec-fields", kind: "section", part: "Part five", title: "Three fields<br>worth a minute", note: "The three traps from part one, answered in the grammar." },
  {
    id: "field-money",
    kind: "statement",
    eyebrow: "Trap one · amount:money",
    title: "The column only ever sees whole minor units.",
    body: "You send 1200.50 and read 1200.50; the database stores 120050. Converted at one seam, decided once, in the field type.",
  },
  {
    id: "field-file",
    kind: "statement",
    eyebrow: "Trap two · photo:file:[image]:5mb",
    title: "Five characters of grammar. An afternoon of work.",
    body: "The bucket, the signed URL, the size cap — and a check on the file's **leading bytes**, so a renamed executable is refused. SVG is excluded, because SVG can carry script.",
  },
  {
    id: "field-cond",
    kind: "split",
    eyebrow: "Trap three · if method == insurance",
    left: {
      heading: "What it does",
      items: ["the form shows it only when it applies", "the validator requires it only when it applies", "the store nulls it when it stops applying", "the column is nullable, always"],
    },
    right: {
      heading: "Why the third one",
      items: ["a payment is edited from insurance to cash", "the form hides the claim number", "so the PATCH never mentions it", "and the claim number stays in the row", "attached to a cash payment, forever"],
    },
  },
  {
    id: "cond-depth",
    kind: "statement",
    eyebrow: "A deliberate limit",
    title: "Conditions are one level deep. On purpose.",
    body: "A field depending on a field that is itself hidden makes the form guess — and there is no good guess.",
  },

  // ─── What you own · the position ────────────────────────────────────────────
  { id: "sec-own", kind: "section", part: "Part six", title: "It is all<br>in your repo", note: "Which raises the obvious question about upgrades." },
  {
    id: "shadcn",
    kind: "statement",
    eyebrow: "You have seen this idea before",
    title: "What shadcn/ui did for components — done to the backend.",
    body: "The engine is **copied into the app**, about 800 readable lines, not imported from a package. Your name on every file.",
  },
  {
    id: "own-split",
    kind: "split",
    eyebrow: "The line is a list, not a feeling",
    left: { heading: "Flare owns", items: ["the resource store", "the query parser", "the row adapters", "password hashing", "the upload guard"], note: "rewritten by `flare update`" },
    right: { heading: "You own", items: ["your descriptors", "your policies", "your routes", "your pages", "your migrations"], note: "never touched" },
  },
  {
    id: "drift",
    kind: "statement",
    eyebrow: "Upgrades, answered",
    title: "Edit ours, and it is drift — not damage.",
    body: "`flare diff` shows how your copy differs from upstream. `flare update --yes` takes the new version, and refuses to run without being asked.",
  },
  {
    id: "not-these",
    kind: "statement",
    eyebrow: "So, the position",
    title: "Not a dependency. Not a template. Not a low-code tool.",
    body: "Nothing of Flare runs in production. Unlike a template, there is an upstream that can still reach you. And the output is ordinary code — because you are going to live in it.",
  },
  {
    id: "position",
    kind: "statement",
    eyebrow: "In one sentence",
    title: "A starting point that stays current, in code you own.",
    body: "That is the whole pitch. Everything else tonight was evidence.",
  },

  // ─── Running it ─────────────────────────────────────────────────────────────
  { id: "sec-deploy", kind: "section", part: "Part seven", title: "Running it", note: "The same seven descriptors, on two platforms." },
  {
    id: "deploy-two",
    kind: "split",
    eyebrow: "One description, two homes",
    left: { heading: "Cloudflare", items: ["Workers, D1, R2", "nothing to install locally", "`flare deploy`"], note: "a small clinic: £0/month" },
    right: { heading: "Next.js", items: ["Vercel, Postgres, Prisma", "`docker compose up -d`", "`flare deploy`"], note: "the default" },
  },
  {
    id: "pick-db",
    kind: "statement",
    eyebrow: "If you only remember one rule",
    title: "Pick for the database.",
    body: "A schema holding real data is the one thing you cannot move in an afternoon. The descriptors, policies, seeds and every dashboard component are the same file on both.",
  },

  // ─── The accounting ─────────────────────────────────────────────────────────
  { id: "sec-score", kind: "section", part: "Part eight", title: "The accounting", note: "What the clinic got that nobody wrote — and what is not finished." },
  {
    id: "scorecard",
    kind: "scorecard",
    eyebrow: "The accounting",
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
    id: "try",
    kind: "statement",
    eyebrow: "Tonight",
    title: '<code class="inline">pnpm create flare-framework clinic</code>',
    body: "Node 22 and pnpm. By the time the kettle boils, you are signing in to your own admin. And bring your questions to the GitHub issues — the limits slide was not decoration.",
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
