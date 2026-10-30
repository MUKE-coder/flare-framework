import type { Slide } from "./types";

/**
 * The talk, told as a story.
 *
 * It starts where the room is: everyone builds with Next.js, and everyone loves it for
 * the same reasons. Then day one of a real project — the blank canvas — and the two
 * to-do lists that come with it: six developer problems (the CRUD hell among them) and
 * four client expectations. The turn: what if there were a different way to start?
 * Flare arrives, the framework word gets struck out, the code-generator family gets its
 * credit, and the proof is a Patient Management System built table by table — each
 * table, its command, and what every flag means — then run, seeded, migrated and
 * deployed step by step. It ends on the real ask: contributors.
 *
 * Every slide carries speaker notes (press N in the viewer). Every command was run.
 */

const DEVS = [
  { code: "01", label: "The CRUD hell" },
  { code: "02", label: "Auth, again" },
  { code: "03", label: "Types written four times" },
  { code: "04", label: "The admin built last" },
  { code: "05", label: "Uploads, never simple" },
  { code: "06", label: "The fix that cannot travel" },
];

const CLIENTS = [
  { code: "01", label: "“Can different people see different things?”" },
  { code: "02", label: "“What will the hosting cost us?”" },
  { code: "03", label: "“Can we see it before it's finished?”" },
  { code: "04", label: "“What happens if we get hacked?”" },
];

const STEPS = [
  { code: "01", label: "Create the app" },
  { code: "02", label: "Generate the seven resources" },
  { code: "03", label: "flare migrate" },
  { code: "04", label: "flare seed demo" },
  { code: "05", label: "flare dev" },
  { code: "06", label: "First sign-up becomes admin" },
  { code: "07", label: "flare dev --tunnel" },
  { code: "08", label: "flare deploy" },
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
    notes: "Breathe. Tonight is a story, not a feature list: the room's own Monday morning, then a different way to start it.",
  },
  {
    id: "me",
    kind: "portrait",
    eyebrow: "Who is telling it",
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
    notes: "Thirty seconds. The one fact to lean on is 150+ client projects — it is the licence for everything that follows.",
  },

  // ─── The room ───────────────────────────────────────────────────────────────
  {
    id: "q-next",
    kind: "statement",
    eyebrow: "A show of hands",
    title: "Who here builds with Next.js?",
    body: "Keep them up.",
    notes: "Actually wait for the hands. This is a JS conference; it will be most of the room. Look around slowly — the next question needs the hands still up.",
  },
  {
    id: "q-love",
    kind: "statement",
    eyebrow: "Second question",
    title: "Why do you love it?",
    body: "Shout them out.",
    notes: "Take three or four answers from the floor. Someone will say 'frontend and backend in one app'; someone will say deployment. Repeat each answer back so the room hears it. Then advance — the next slide is their answers, written down.",
  },
  {
    id: "love-answers",
    kind: "list",
    eyebrow: "The answers that always come up",
    items: [
      { code: "01", label: "One app — frontend and backend together" },
      { code: "02", label: "Deploy the whole thing free; cheap to run" },
      { code: "03", label: "File-based routing, zero config" },
      { code: "04", label: "Server and client in one file" },
      { code: "05", label: "It's just React" },
      { code: "06", label: "Everyone hires for it" },
    ],
    notes: "Point at whichever ones the room actually said — 'you said this one, and this one.' The deck agreeing with the audience buys you the right to disagree later.",
  },
  {
    id: "agree",
    kind: "statement",
    eyebrow: "And it's all true",
    title: "Next.js earned this room.",
    body: "So nothing tonight is against it. Tonight is about what happens **after** you pick it — on day one of a real project.",
    notes: "Important beat: disarm the defensiveness now. You are not here to dunk on Next.js; you are here about day one. Then advance into the dark.",
  },

  // ─── The blank canvas ───────────────────────────────────────────────────────
  {
    id: "blank-canvas",
    kind: "statement",
    eyebrow: "If you have built full-stack, you know this feeling",
    title: "The blank canvas.",
    body: "A new client. An empty folder. And you already know everything this project owes you **before** the first feature: auth, a database, an admin, uploads, roles, a deploy.",
    notes: "Slow down here. Every full-stack developer knows the dread of an empty repo — not because it is hard, but because they know exactly how much ceremony stands between them and the first real feature.",
  },
  {
    id: "two-lists",
    kind: "statement",
    eyebrow: "Because a real project",
    title: "comes with two to-do lists.",
    body: "Yours — the developer problems. And the client's — their expectations. Neither one is on the quote.",
    notes: "This sentence is the map of the next ten minutes: your six, then their four.",
  },

  // ─── Developer problems · top six ───────────────────────────────────────────
  { id: "sec-dev", kind: "section", part: "List one", title: "Your six", note: "The developer problems. You have met every one of them.", notes: "Say 'yours first' and advance. Show the list, read none of it." },
  {
    id: "d-all",
    kind: "list",
    eyebrow: "Developer problems · the top six",
    items: DEVS,
    notes: "The whole list once. The next six slides take them one at a time, with the rest faded so the room keeps its place.",
  },
  {
    id: "d1",
    kind: "focus",
    eyebrow: "Your six · 01",
    items: DEVS,
    active: "01",
    title: "The CRUD hell.",
    body: "Model. Validators. Routes. A table. A form. Then the same five ceremonies for the next entity, and the next. By the tenth table you are not programming — you are transcribing.",
    notes: "Name it with relish — 'the CRUD hell' gets a knowing laugh. The sting: nothing about table ten was harder than table one. It was just table one, again.",
  },
  {
    id: "d2",
    kind: "focus",
    eyebrow: "Your six · 02",
    items: DEVS,
    active: "02",
    title: "Auth is a week<br>you cannot bill.",
    body: "Sign-up, reset emails, sessions, two-factor. Identical on every project — and dangerous on every project, because auth is where a shortcut becomes a headline.",
    notes: "The key word is 'bill'. No client has ever knowingly paid for a password reset flow.",
  },
  {
    id: "d3",
    kind: "focus",
    eyebrow: "Your six · 03",
    items: DEVS,
    active: "03",
    title: "The same shape,<br>spelled four times.",
    body: "The Prisma model. The Zod schema for create. Another for update, all optional. The type the form uses. Four descriptions of one thing, kept in step by memory.",
    notes: "Ask who has shipped a field that existed in three of the four places. The fourth place is always found by a user.",
  },
  {
    id: "d4",
    kind: "focus",
    eyebrow: "Your six · 04",
    items: DEVS,
    active: "04",
    title: "The admin panel<br>is built last.",
    body: "It is the screen the client spends their working day in — and it is built by whoever is free, on the last Friday, out of whatever components are lying around.",
    notes: "The client does not live on your landing page. They live in the admin — the part that got one Friday.",
  },
  {
    id: "d5",
    kind: "focus",
    eyebrow: "Your six · 05",
    items: DEVS,
    active: "05",
    title: "Uploads are never<br>just uploads.",
    body: "A bucket. A signed URL. A size cap. And a check on what is actually **in** the file — because an `.exe` renamed to `.jpg` has exactly the extension you asked for.",
    notes: "Read the renamed-executable line slowly. It pays off later in the field grammar.",
  },
  {
    id: "d6",
    kind: "focus",
    eyebrow: "Your six · 06",
    items: DEVS,
    active: "06",
    title: "The fix that<br>cannot travel.",
    body: "You cope by copying the last project, or buying a template. Then you fix a session bug in March — in **one** repository. The other four are in production, and there is no mechanism that carries the fix to them.",
    notes: "Hold the phrase 'no mechanism' — it returns word for word when flare update appears. This slide is why copy-paste and templates are not the answer, which the whole talk turns on.",
  },

  // ─── Client expectations · top four ─────────────────────────────────────────
  { id: "sec-client", kind: "section", part: "List two", title: "Their four", note: "The client's expectations — every one a quote, asked before the feature is mentioned.", notes: "Switch voice: these are the client's words. Read them as quotes." },
  {
    id: "c-all",
    kind: "list",
    eyebrow: "Client expectations · in their words",
    items: CLIENTS,
    notes: "Read two of the four in the client's voice. Then the line that sets up the section: the honest answer to each is 'yes, in about three weeks' — and the client hears that as a no.",
  },
  {
    id: "c1",
    kind: "focus",
    eyebrow: "Their four · 01",
    items: CLIENTS,
    active: "01",
    title: "“Can different people<br>see different things?”",
    body: "Roles, then permissions, then per-record ownership — the receptionist books, the doctor reads, only the owner sees money. Always one layer deeper than the first conversation suggests.",
    notes: "Roles is easy, permissions is fine; per-record — a doctor sees their own patients — is where it becomes a week. And it must hold in the export too, not just on the screen.",
  },
  {
    id: "c2",
    kind: "focus",
    eyebrow: "Their four · 02",
    items: CLIENTS,
    active: "02",
    title: "“What will the hosting<br>cost us?”",
    body: "A clinic in Kampala is not budgeting for a surprise invoice in dollars. “It depends on usage” is not an answer they can take to the owner.",
    notes: "Callback to the love list: 'cheap to run' was answer 02 on the Next.js slide. The client is asking the same question you were. Flare's deploy act answers it with a number.",
  },
  {
    id: "c3",
    kind: "focus",
    eyebrow: "Their four · 03",
    items: CLIENTS,
    active: "03",
    title: "“Can we see it<br>before it's finished?”",
    body: "A reasonable ask that costs a deploy, a staging environment, and a database that doesn't look embarrassing on a projector.",
    notes: "Everyone has demoed an app with a patient called 'test test'. Let them remember that.",
  },
  {
    id: "c4",
    kind: "focus",
    eyebrow: "Their four · 04",
    items: CLIENTS,
    active: "04",
    title: "“What happens<br>if we get hacked?”",
    body: "They mean: is there a lock on the door? You hear: rate limits, bans, two-factor, an audit trail — none of which is in the estimate, all of which is promised for phase two.",
    notes: "The last clause sets up the next slide: phase two is where client expectations go to die.",
  },
  {
    id: "three-weeks",
    kind: "statement",
    eyebrow: "The honest answer to all ten",
    title: "“Yes — in about three weeks.”",
    body: "Which the client hears as a no. So the security, the audit and the polish are promised for phase two — and phase two never arrives.",
    notes: "The emotional low point, on purpose. Sit in it for one breath. Then the turn.",
  },

  // ─── The turn ───────────────────────────────────────────────────────────────
  {
    id: "what-if",
    kind: "statement",
    eyebrow: "So",
    title: "What if there were a different way to start?",
    body: "Not a different framework. A different **first day**.",
    notes: "Shortest slide in the deck. Let the question hang for two full seconds before advancing.",
  },
  {
    id: "introducing",
    kind: "section",
    part: "Introducing",
    title: "Flare",
    note: "The fastest way to ship a full-stack app on Next.js or Cloudflare.",
    notes: "The reveal. Say the tagline once, exactly as written — it is the line on the flyer.",
  },
  {
    id: "framework-hate",
    kind: "split",
    eyebrow: "Wait — a framework?",
    left: {
      heading: "Why developers flinch at that word",
      items: ["breaking changes every major version", "abstractions you end up fighting", "magic you cannot debug", "lock-in you cannot leave", "and the rewrite when it dies"],
    },
    right: {
      heading: "Flare's answer",
      items: ["nothing of Flare runs in production", "plain Next.js code, in **your** repo", "the engine: ~800 readable lines, copied in", "delete the CLI — the app still builds"],
    },
    notes: "Give the left column its due — every item is a scar someone in the room has. Then the right column, slowly. The last line is the one to land.",
  },
  {
    id: "not-a-framework",
    kind: "statement",
    eyebrow: "So, honestly",
    title: 'Flare, the <span style="text-decoration:line-through;text-decoration-thickness:6px;opacity:0.45">framework</span>',
    body: "Delete the CLI tomorrow, and your code keeps working. That is the test — and it is the whole philosophy in one sentence.",
    notes: "The strike-through gets a laugh after the setup. Say the delete-the-CLI sentence twice if the room is warm.",
  },
  {
    id: "generator-family",
    kind: "statement",
    eyebrow: "What it actually is",
    title: "A code generator — from a proud old family.",
    body: "Rails gave us `scaffold`. Django gave us the admin. Laravel gave us `artisan make`. Twenty years of proof that generating the boring parts works.",
    notes: "Give the elders genuine respect — half the room learned on one of these. The point is lineage: this is not a weird new idea, it is the oldest good idea in web frameworks.",
  },
  {
    id: "generator-further",
    kind: "split",
    eyebrow: "The difference: Flare takes it further",
    left: {
      heading: "Where the family stopped",
      items: ["scaffold a model, a controller — one layer", "the admin lives in the framework", "regenerate = overwrite your edits", "one language, one runtime, their server"],
    },
    right: {
      heading: "Where Flare keeps going",
      items: ["one command: the **whole vertical slice**", "the admin is generated into your repo", "your edits are detected as drift, never lost", "same description → Next.js **or** Cloudflare"],
    },
    notes: "Four differences, left-right pairs — read them as pairs. 'Vertical slice' means: schema, migration, validators, API, typed client, and four admin pages from one command. Drift: flare diff shows your changes; flare update brings upstream fixes without trampling them.",
  },

  // ─── The build: a Patient Management System ─────────────────────────────────
  { id: "sec-build", kind: "section", part: "Prove it", title: "A Patient<br>Management System", note: "A real brief, built the Flare way, in front of you.", notes: "Energy up. From here to the end it is all building." },
  {
    id: "how-long",
    kind: "statement",
    eyebrow: "Before we start",
    title: "How long would this take you?",
    body: "Patients, doctors, appointments, visits, prescriptions, invoices, payments. Auth, admin, uploads, roles, deploy. Think of your real number — with meetings in it.",
    notes: "Take two or three answers out loud. Most honest answers are in weeks. Anchor the room's number before showing yours — the contrast does the selling later.",
  },
  {
    id: "the-insight",
    kind: "statement",
    eyebrow: "The Flare way",
    title: "Understand three things: the tables, their fields, and how they relate.",
    body: "That is the real work — and you were always going to do it. Flare's job is to translate that understanding **directly into code**.",
    notes: "This is the method slide. Everything that follows is literally this: design tables, read them back as commands.",
  },
  {
    id: "tables-all",
    kind: "cards",
    eyebrow: "The design: seven tables",
    title: "The whole system",
    cards: [
      { num: "01", name: "patients", note: "The person, and their photo" },
      { num: "02", name: "doctors", note: "Who sees them, and their licence" },
      { num: "03", name: "appointments", note: "A booking, with a status", hangs: "patient · doctor" },
      { num: "04", name: "visits", note: "What actually happened", hangs: "appointment" },
      { num: "05", name: "prescriptions", note: "What was given, and how often", hangs: "visit" },
      { num: "06", name: "invoices", note: "What it costs", hangs: "patient · visit" },
      { num: "07", name: "payments", note: "What was paid, and how", hangs: "invoice" },
    ],
    notes: "Point along the chain: a patient is booked, the booking becomes a visit, the visit produces a prescription and an invoice, the invoice gets paid. Seven tables, one story.",
  },
  {
    id: "install",
    kind: "code",
    eyebrow: "Step zero · install",
    lang: "bash",
    code: `# one-off, global CLI (optional)
npm install -g @flaredev/cli

# create the app — this is the real start
pnpm create flare-framework clinic
cd clinic`,
    caption: "Node 22+. `create` scaffolds a working app: sign-in, a database, an admin shell and the bindings — before any resource exists.",
    notes: "One beat: before a single table, the app already runs with auth. The blank canvas is already gone.",
  },
  {
    id: "cmd-anatomy",
    kind: "code",
    eyebrow: "The taxonomy of a Flare command",
    lang: "bash",
    code: `npx flare gen resource <Name> \\
       --icon  <lucide-icon>   # the sidebar icon
       --group <Group>         # where it sits in the admin nav
       --fields '<field>:<type><modifiers>, …'`,
    caption: "`gen resource` is the verb. The `--fields` string is the table design, written as a sentence — the grammar on the next slide.",
    notes: "Read it as grammar: verb, name, two cosmetic flags, and then the fields string, which is where all the meaning lives.",
  },
  {
    id: "field-grammar",
    kind: "table",
    eyebrow: "The field grammar · what each piece means",
    title: "One sentence per table",
    head: ["Piece", "Means"],
    rows: [
      ["name:string", "a required text column"],
      ["!", "unique — a constraint and the 409 that explains itself"],
      ["?", "optional — nullable column, optional in the form"],
      ["enum(a,b,c)", "a closed list: CHECK constraint + dropdown"],
      ["belongsTo(Model)", "foreign key, index, and a relation picker"],
      ["file:[image]:5mb", "upload: bucket, signed URL, size cap, byte check"],
      ["… if status == cancelled", "a field that only sometimes applies"],
    ],
    notes: "This slide is the reference card — people photograph it. Each row returns in a real command within the next ten minutes, so do not over-explain here.",
  },

  // ─── Table by table ─────────────────────────────────────────────────────────
  {
    id: "t-patient",
    kind: "table",
    eyebrow: "Table 1 of 7 · patients",
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
    notes: "Design first, command second — keep this rhythm for all seven tables. The design slide is where you talk; the command slide should feel inevitable.",
  },
  {
    id: "cmd-patient",
    kind: "code",
    eyebrow: "patients · as a command",
    lang: "bash",
    code: `npx flare gen resource Patient --icon user-round --group Clinic \\
  --fields 'name:string!, phone:tel!, dateOfBirth:date,
            sex:enum(female,male),
            photo:file:[image]:5mb?, allergies:text?'`,
    caption: "`tel` validates per country. `!` on phone: unique. `file:[image]:5mb?` is the bucket, the signed URL, the size cap and the leading-bytes check — optional, because not everyone has a photo.",
    notes: "Walk the flags once, thoroughly — this is the teaching table. tel not string: E.164, validated per country. The ! is the unique constraint and the polite 409. The file field is D5 from the list, answered in eleven characters.",
  },
  {
    id: "t-doctor",
    kind: "table",
    eyebrow: "Table 2 of 7 · doctors",
    title: "Who sees them",
    head: ["Field", "Type", "Why"],
    rows: [
      ["name", "text, required", "—"],
      ["email", "email, unique", "one account per doctor"],
      ["specialty", "a closed list of five", "drives who can be booked for what"],
      ["licenceNumber", "text, unique", "a clinic is inspected on this"],
      ["active", "true | false", "a locum leaves; the history stays"],
    ],
    notes: "One beat: active is a boolean, not a delete — a doctor who leaves keeps their history. Design decisions like this are why the tables are the real work.",
  },
  {
    id: "cmd-doctor",
    kind: "code",
    eyebrow: "doctors · as a command",
    lang: "bash",
    code: `npx flare gen resource Doctor --icon stethoscope --group Clinic \\
  --fields 'name:string!, email:email!,
            specialty:enum(gp,paediatrics,dental,gyn,surgery),
            licenceNumber:string!, active:boolean'`,
    caption: "`email` is a type of its own: format validation and a mailto link in the admin. Two `!` fields — two unique constraints.",
    notes: "Faster now — the room knows the grammar. Point only at email being a first-class type, not a string with vibes.",
  },
  {
    id: "t-appointment",
    kind: "table",
    eyebrow: "Table 3 of 7 · appointments",
    title: "The booking — and the first relationship",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "restrict: you cannot delete a booked patient"],
      ["doctorId", "→ doctors", "—"],
      ["scheduledFor", "date and time", "—"],
      ["status", "booked | arrived | seen | cancelled | noShow", "the front desk runs on this"],
      ["cancelledBecause", "text — **only when cancelled**", "an empty reason is a complaint waiting to happen"],
    ],
    notes: "Two foreign keys and the deck's favourite field. Nobody asks for cancelledBecause in week zero; the clinic manager asks in week two, after the first argument at the front desk.",
  },
  {
    id: "cmd-appointment",
    kind: "code",
    eyebrow: "appointments · as a command",
    lang: "bash",
    code: `npx flare gen resource Appointment --icon calendar-clock --group Clinic \\
  --fields 'patient:belongsTo(Patient), doctor:belongsTo(Doctor),
            scheduledFor:datetime,
            status:enum(booked,arrived,seen,cancelled,noShow),
            cancelledBecause:string if status == cancelled'`,
    caption: "`belongsTo` is the foreign key, its index, and a searchable picker in the form. The `if` clause is checked at **generation** time: `cancelled` must be one of the statuses, or no file is written.",
    notes: "Two things to point at: belongsTo buys the whole relationship including the UI picker; and the condition is validated when you generate, not discovered in production.",
  },
  {
    id: "cond-magic",
    kind: "statement",
    eyebrow: "That if clause, in full",
    title: "One clause. Three behaviours. Zero disagreements.",
    body: "The form **shows** the field only when cancelled. The validator **requires** it only when cancelled. And when a booking is edited away from cancelled, the store **clears** it — so last week's reason never haunts the row.",
    notes: "By hand this rule lives in three places — a useEffect, a refine(), and a store nobody remembered — and they drift. Here it is one clause, so they cannot.",
  },
  {
    id: "t-visit",
    kind: "table",
    eyebrow: "Table 4 of 7 · visits",
    title: "What actually happened",
    head: ["Field", "Type", "Why"],
    rows: [
      ["appointmentId", "→ appointments", "a visit only exists for a booking"],
      ["complaint", "long text", "in the patient's words"],
      ["diagnosis", "text", "in the doctor's"],
      ["followUp", "true | false", "—"],
      ["followUpOn", "date — **only when followUp**", "a date on a visit needing no follow-up is noise"],
    ],
    notes: "Same conditional pattern, second appearance — the room should recognise it now. That recognition is the grammar teaching itself.",
  },
  {
    id: "cmd-visit",
    kind: "code",
    eyebrow: "visits · as a command",
    lang: "bash",
    code: `npx flare gen resource Visit --icon clipboard-list --group Clinic \\
  --fields 'appointment:belongsTo(Appointment),
            complaint:text, diagnosis:string,
            followUp:boolean,
            followUpOn:date if followUp == true'`,
    caption: "`text` is the long-text column with a textarea; `string` the short one. The conditional date works exactly like the cancellation reason.",
    notes: "Quick slide. One pointer: text vs string decides column and input both.",
  },
  {
    id: "t-prescription",
    kind: "table",
    eyebrow: "Table 5 of 7 · prescriptions",
    title: "What was given",
    head: ["Field", "Type", "Why"],
    rows: [
      ["visitId", "→ visits", "a prescription belongs to a visit"],
      ["drug", "text, required", "—"],
      ["dosage", "text", "in units the pharmacist reads"],
      ["frequency", "text", "“1 × 3, after meals”"],
      ["days", "number", "how long the course runs"],
    ],
    notes: "The simplest table — say so, and move fast. Rhythm matters more than coverage by table five.",
  },
  {
    id: "cmd-prescription",
    kind: "code",
    eyebrow: "prescriptions · as a command",
    lang: "bash",
    code: `npx flare gen resource Prescription --icon pill --group Clinic \\
  --fields 'visit:belongsTo(Visit), drug:string!,
            dosage:string, frequency:string, days:int'`,
    caption: "`int` is a whole number: integer column, stepper input, no decimals accepted.",
    notes: "Ten seconds. The next two tables are the money — slow back down there.",
  },
  {
    id: "t-invoice",
    kind: "table",
    eyebrow: "Table 6 of 7 · invoices",
    title: "What it costs",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "—"],
      ["visitId", "→ visits", "an invoice bills a visit"],
      ["amount", "money", "**not a float** — next slide shows why"],
      ["status", "draft | sent | paid | overdue", "—"],
    ],
    notes: "Tee up the float slide with the 'why' cell. Deadpan: 'amount is money, not float. Here is what float thinks money is.'",
  },
  {
    id: "float-fail",
    kind: "statement",
    eyebrow: "What a float thinks money is",
    title: "0.07 + 0.07 + 0.07 = 0.21000000000000002",
    body: "Found months later, by whoever reconciles the bank statement. Fixed with a migration and a data repair, in production.",
    notes: "Read every digit out loud — the laugh is in the digits. Then the second sentence slowly; everyone who has done the production repair goes quiet.",
  },
  {
    id: "cmd-invoice",
    kind: "code",
    eyebrow: "invoices · as a command",
    lang: "bash",
    code: `npx flare gen resource Invoice --icon receipt --group Clinic \\
  --fields 'patient:belongsTo(Patient), visit:belongsTo(Visit),
            amount:money,
            status:enum(draft,sent,paid,overdue)'`,
    caption: "`money` stores whole minor units — the column only ever sees 120050. The API and forms still speak 1200.50; three extra decimals are a 422, not a silent rounding.",
    notes: "One word in the grammar answers the previous slide. That is the whole pitch of field types: a decision made once, correctly, in every layer.",
  },
  {
    id: "t-payment",
    kind: "table",
    eyebrow: "Table 7 of 7 · payments",
    title: "What was paid, and how",
    head: ["Field", "Type", "Why"],
    rows: [
      ["invoiceId", "→ invoices", "—"],
      ["amount", "money", "partial payments are normal"],
      ["method", "cash | mobileMoney | card | insurance", "a Ugandan clinic takes all four"],
      ["claimNumber", "text — **only when insurance**", "useless on cash, required on a claim"],
    ],
    notes: "mobileMoney in the enum always gets a nod in this room. And the conditional pattern appears a third time — by now nobody needs it explained.",
  },
  {
    id: "cmd-payment",
    kind: "code",
    eyebrow: "payments · as a command — the last one",
    lang: "bash",
    code: `npx flare gen resource Payment --icon hand-coins --group Clinic \\
  --fields 'invoice:belongsTo(Invoice), amount:money,
            method:enum(cash,mobileMoney,card,insurance),
            claimNumber:string if method == insurance'`,
    caption: "Seven tables, seven sentences. Every flag on every command was a row in a table you designed.",
    notes: "Close the loop explicitly: 'notice we never invented anything at the keyboard — we read the tables back as commands.' That is the method.",
  },
  {
    id: "what-each-made",
    kind: "statement",
    eyebrow: "And each of those seven commands wrote",
    title: "The schema. The migration. Validators. The API. A typed client. Four admin pages.",
    body: "Nineteen files per table, into **your** repository — the whole vertical slice, with loading skeletons shaped like each screen. The CRUD hell, generated out of existence.",
    notes: "Tick list one, item 01, out loud: the CRUD hell is gone — not sped up, gone. If demoing live, this is the moment to show the admin that now exists.",
  },

  // ─── Run it, step by step ───────────────────────────────────────────────────
  { id: "sec-run", kind: "section", part: "Step by step", title: "From commands<br>to a running clinic", note: "Migrate, seed, run, share, deploy — in order.", notes: "This act is a checklist on purpose: it doubles as the quick-start they will follow at home." },
  {
    id: "steps-all",
    kind: "list",
    eyebrow: "The whole path",
    items: STEPS,
    notes: "Show the eight once. Steps one and two are already done — say so and point at where you are.",
  },
  {
    id: "step-migrate",
    kind: "code",
    eyebrow: "Step 03 · the database catches up",
    lang: "text",
    code: `$ flare migrate

  0000_init.sql                 ✓
  0001_create_patients.sql      ✓
  0002_create_doctors.sql       ✓
  …
  0007_create_payments.sql      ✓`,
    caption: "Plain SQL migrations, written by the generator, applied in order. Readable in review like any migration you wrote yourself.",
    notes: "Point once: these are files in the repo, not magic. A reviewer reads them like hand-written SQL — CHECK constraints, foreign keys and all.",
  },
  {
    id: "step-seed",
    kind: "statement",
    eyebrow: "Step 04 · flare seed demo",
    title: "A clinic that looks like a clinic.",
    body: "Realistic patients, bookings and invoices — not three rows named “asdf”. Friday's demo stops being a liability the moment the data looks true.",
    notes: "Everyone has presented an empty app. Seed data is the cheapest credibility a demo can buy.",
  },
  {
    id: "step-dev",
    kind: "statement",
    eyebrow: "Step 05 · flare dev",
    title: "localhost:3000 — and the admin is already there.",
    body: "A sign-in page. A sidebar with seven resources. Tables that sort, filter, page and export. Forms with the pickers and the conditional fields. Nobody has opened a component file.",
    notes: "If demoing live: sixty seconds here, no more. Book an appointment, cancel it, show the reason field appear — that is the conditional clause, visible.",
  },
  {
    id: "step-admin",
    kind: "statement",
    eyebrow: "Step 06 · the first sign-up",
    title: "The first account becomes the admin.",
    body: "Every resource arrives admin-only, enforced by the API **and** the admin UI from the same policy file. A patient record open to anyone who registers is not a bug you want to find in a clinic.",
    notes: "This is client expectation 01 and 04 in one slide: who sees what, and the lock on the door — defaults, not phase two.",
  },
  {
    id: "step-tunnel",
    kind: "statement",
    eyebrow: "Step 07 · flare dev --tunnel",
    title: "Show it before you ship it.",
    body: "Your local app on a public HTTPS link — no account, no DNS, no open ports. The client sees Friday's demo on Wednesday, from their own phone.",
    notes: "Client expectation 03, answered by name. The phrase that lands: 'from their own phone'.",
  },
  {
    id: "step-deploy",
    kind: "code",
    eyebrow: "Step 08 · the last command",
    lang: "text",
    code: `$ npx flare deploy

flare  Applying migrations to clinic-db (remote)
       0001_create_patients.sql ✓  …  0007_create_payments.sql ✓
flare  Deploying
       Uploaded clinic
flare  Generating BETTER_AUTH_SECRET for production

Deployed to https://clinic.you.workers.dev`,
    caption: "Migrations first, then the deploy, then any secret you forgot — generated, not googled. Nothing to click on a dashboard.",
    notes: "Point at the secret line: the deploy refuses to ship a half-configured app, and fixes it instead of erroring.",
  },
  {
    id: "deploy-two",
    kind: "split",
    eyebrow: "And remember “cheap to run”?",
    left: { heading: "Cloudflare", items: ["Workers, D1, R2", "no cold starts", "a clinic this size: **~$0–5/month**"], note: "`flare deploy`" },
    right: { heading: "Next.js on Vercel", items: ["Neon Postgres, Prisma", "real Node, every npm package", "the default stack"], note: "`flare deploy`, the same command" },
    caption: "The same seven commands, the same descriptors, either home. Pick for the database — everything else travels.",
    notes: "Close two loops at once: the room's own 'cheap to run' from the love list, and the client's hosting question — now with a number a clinic owner can hear.",
  },
  {
    id: "how-long-now",
    kind: "statement",
    eyebrow: "So — the number you thought of earlier",
    title: "The tables took longer than the app.",
    body: "And the tables were the real work all along. Seven commands, a migrate, a seed, a deploy: the rest of your estimate is now **features**.",
    notes: "Call back the number they said at 'how long would this take you'. Don't gloat — one sentence, then move to the honest slide.",
  },

  // ─── Close ──────────────────────────────────────────────────────────────────
  {
    id: "honest",
    kind: "split",
    eyebrow: "Before you believe all of it",
    left: { heading: "Not there yet", items: ["no multi-tenancy — one clinic per app", "no field-level permissions", "no plugin system", "realtime is Cloudflare-only"], note: "on the roadmap, publicly" },
    right: { heading: "Known costs", items: ["pre-1.0: the format can still move", "the Cloudflare stack runs on a beta runtime", "one maintainer", "181 files before you add anything"], note: "written down in the docs" },
    caption: "A framework that only lists its strengths is asking you to find the weaknesses yourself, on your own project, at your own cost.",
    notes: "Do not rush this — it buys more credibility than any demo. And 'one maintainer' is the bridge to the next slide. Point at it as you advance.",
  },
  {
    id: "contribute",
    kind: "statement",
    eyebrow: "Which brings me to the real ask",
    title: "Flare needs people who will stay.",
    body: "It is MIT. It is one maintainer. The roadmap is public and bigger than one person: multi-tenancy, field-level permissions, a plugin system. A project becomes real the day it stops being one person's.",
    notes: "This is why you gave the talk. Be direct: not 'check it out' — 'I am asking for contributors who will dedicate time.' Make eye contact, not slide contact.",
  },
  {
    id: "contribute-how",
    kind: "list",
    eyebrow: "Where to start, tonight",
    items: [
      { code: "01", label: "Build something this week — file what breaks" },
      { code: "02", label: "Pick a good-first-issue on GitHub" },
      { code: "03", label: "Write a guide, or an example app" },
      { code: "04", label: "Take a roadmap item: tenancy, permissions, plugins" },
      { code: "05", label: "Teach it — a video, a post, your own meetup" },
      { code: "06", label: "github.com/MUKE-coder/flare-framework" },
    ],
    notes: "Six doors in, from twenty minutes to a core contribution. Say that the issues are triaged and the roadmap items have write-ups — nobody starts from a blank canvas here either.",
  },
  {
    id: "try",
    kind: "statement",
    eyebrow: "And tonight",
    title: '<code class="inline">pnpm create flare-framework clinic</code>',
    body: "Node 22 and pnpm. By the time the kettle boils, you are signing in to your own admin — and you already know all seven commands that come next.",
    notes: "One command, one promise. The room has literally seen every step; that is the point of the build act.",
  },
  {
    id: "close",
    kind: "cover",
    event: "Thank you",
    title: "Flare",
    tagline: "pnpm create flare-framework clinic  ·  flare-docs.codetotech.com  ·  github.com/MUKE-coder/flare-framework",
    speaker: "Muke JohnBaptist",
    notes: "Leave this up through Q&A — the command and both links stay on screen.",
  },
];
