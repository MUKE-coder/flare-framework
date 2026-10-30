import type { Slide } from "./types";

/**
 * The talk — built on the same skeleton as the Grit deck at gritframework.dev/talk,
 * because the two frameworks are siblings and the structure is the part that works:
 *
 *   hook → twelve developer problems, one at a time → eight client questions, in the
 *   client's voice → why both lists survive excellent libraries → the hinge question →
 *   the idea, one command, what it wrote (file by file) → four concepts → the clinic
 *   build → ship it → two scorecards that pay the two lists off → close.
 *
 * Slides 1–3 (cover, the strike-through, the speaker) are kept from the previous deck.
 * Every slide carries speaker notes (press N in the viewer). Every command was run; the
 * line counts are `wc -l` of what came out. If a number changes, change it here rather
 * than saying something different on stage.
 */

const DLIST = [
  { code: "D1", label: "The copy-paste start" },
  { code: "D2", label: "The template you bought" },
  { code: "D3", label: "Types written four times" },
  { code: "D4", label: "The same table, again" },
  { code: "D5", label: "Auth, the sixth time" },
  { code: "D6", label: "Uploads, never simple" },
  { code: "D7", label: "The undocumented API" },
  { code: "D8", label: "CSV, both directions" },
  { code: "D9", label: "No data to build against" },
  { code: "D10", label: "Money as a float" },
  { code: "D11", label: "The admin nobody budgets" },
  { code: "D12", label: "Paying a model to write it" },
];

const BLIST = [
  { code: "B1", label: "“Can different people see different things?”" },
  { code: "B2", label: "“What happens if we get hacked?”" },
  { code: "B3", label: "“Can we get everything into Excel?”" },
  { code: "B4", label: "“Who changed this?”" },
  { code: "B5", label: "“Our staff photograph things on their phones.”" },
  { code: "B6", label: "“Can we see it before it's finished?”" },
  { code: "B7", label: "“What will the hosting cost us?”" },
  { code: "B8", label: "“Can we sign in with Google?”" },
];

export const slides: Slide[] = [
  // ─── Opening · kept ─────────────────────────────────────────────────────────
  {
    id: "title",
    kind: "cover",
    event: "JS Meetup · 2026",
    title: "Flare Framework",
    tagline: "The fastest way to ship a full-stack app on Next.js or Cloudflare.",
    speaker: "Muke JohnBaptist · Desishub",
    notes: "Breathe. The deck does the arguing tonight; your job is pacing. Next slide is the joke, so set it up straight-faced: 'Flare is a framework.'",
  },
  {
    id: "not-a-framework",
    kind: "statement",
    eyebrow: "Except",
    title: 'Flare, the <span style="text-decoration:line-through;text-decoration-thickness:6px;opacity:0.45">framework</span>',
    body: "Next.js and Cloudflare, with the boilerplate already written — into **your** repository, under your name. You could delete the CLI tomorrow and the app would still build.",
    notes: "Land the strike-through, then the one claim that matters: delete the CLI tomorrow and the app still builds. Say that sentence twice if the room is warm. Everything later hangs off it.",
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
    notes: "Thirty seconds, no more. The one fact to lean on is 150+ client projects — it is the licence for the next forty minutes of complaining.",
  },

  // ─── The hook ───────────────────────────────────────────────────────────────
  {
    id: "hook",
    kind: "statement",
    eyebrow: "A question",
    title: "How long before the first line that is actually the product?",
    body: "Auth, a database, an admin panel, uploads, roles, CSV, a deploy — before the first feature the client is paying for. Not the first line you type. The first line that is about **their clinic**.",
    notes: "Ask it, then actually wait. Let someone say a number. Whatever they say, the honest answer is days, not hours — and everyone in the room has done every item on that list. If nobody answers: 'for me it was about four days, and I did it many times before I got annoyed enough to fix it.'",
  },
  {
    id: "hook-ai",
    kind: "statement",
    eyebrow: "The same question, for the AI",
    title: "And if you hand that setup to an AI — how many tokens, and is it the same twice?",
    body: "Tokens are the half you can measure. The other half is whether the second project has the same structure, the same auth and the same conventions as the first.",
    notes: "Let them answer this one too. Someone says a dollar figure; someone says 'depends on the prompt' — which is the point. Do not argue against AI here: the talk's position is the opposite, and D12 comes back to it.",
  },

  // ─── The twelve ─────────────────────────────────────────────────────────────
  { id: "sec-dev", kind: "section", part: "First", title: "The twelve", note: "Twelve problems that cost you the first two weeks. You know every one of them.", notes: "Say 'twelve' and advance. The list comes next; read none of it out loud." },
  {
    id: "d-all",
    kind: "list",
    eyebrow: "The two weeks, itemised",
    items: DLIST,
    notes: "Show the whole list once, read none of it. The next slides take them one at a time, with the other eleven faded, so the room always knows where it is.",
  },
  {
    id: "d1",
    kind: "focus",
    eyebrow: "The twelve · D1",
    items: DLIST,
    active: "D1",
    title: "You open the last project<br>and start pasting.",
    body: "Auth. Uploads. Email. You wrote them already — and writing a session refresh from scratch a sixth time is worse than copying it.",
    notes: "This is the one that gets the laugh, so pause for it. Everyone has a repository they open purely to lift the auth folder out of. The sting comes on the next slide.",
  },
  {
    id: "d1-ex",
    kind: "statement",
    eyebrow: "D1 · what copying actually costs",
    title: "The fix exists. In one of your five repositories.",
    body: "You fixed the session refresh in March — in one project. The other four are in production, and **there is no mechanism** that moves the fix to them.",
    notes: "Hold the phrase 'there is no mechanism'. It comes back, word for word, in concept three — where flare diff and flare update are the mechanism.",
  },
  {
    id: "d2",
    kind: "focus",
    eyebrow: "The twelve · D2",
    items: DLIST,
    active: "D2",
    title: "Or you buy a template,<br>and inherit a fork.",
    body: "It has auth, it has a dashboard, and it is correct on the day you clone it. You strip half of it and patch the rest — and upstream's fixes can never reach you again.",
    notes: "Say this gently; half the room has a template they are fond of. The problem is not day one. It is that a clone cannot improve.",
  },
  {
    id: "d3",
    kind: "focus",
    eyebrow: "The twelve · D3",
    items: DLIST,
    active: "D3",
    title: "The same shape,<br>spelled four times.",
    body: "The Prisma model. The Zod schema for create. Another for update, all optional. The type the form uses. Four descriptions of one thing, kept in step by memory.",
    notes: "Ask who has shipped a field that existed in three of the four places. The fourth place is always found by a user.",
  },
  {
    id: "d4",
    kind: "focus",
    eyebrow: "The twelve · D4",
    items: DLIST,
    active: "D4",
    title: "And the table<br>is the same table.",
    body: "Sort, filter, paging, an empty state, a loading state. You built it for products, for students, for tenants. It is always the same table.",
    notes: "Quick slide. Name the three projects out loud — products, students, tenants — and move.",
  },
  {
    id: "d5",
    kind: "focus",
    eyebrow: "The twelve · D5",
    items: DLIST,
    active: "D5",
    title: "Auth is a week<br>you cannot bill.",
    body: "Sign-up, reset emails, sessions, two-factor. Identical on every project — and dangerous on every project, because auth is where a shortcut becomes a headline.",
    notes: "The key word is 'bill'. No client has ever knowingly paid for a password reset flow.",
  },
  {
    id: "d6",
    kind: "focus",
    eyebrow: "The twelve · D6",
    items: DLIST,
    active: "D6",
    title: "Uploads are never<br>just uploads.",
    body: "A bucket. A signed URL. A size cap. And a check on what is actually **in** the file — because an `.exe` renamed to `.jpg` has exactly the extension you asked for.",
    notes: "The renamed-executable line lands well read slowly. This one pays off twice later: the field grammar, and B5.",
  },
  {
    id: "d7",
    kind: "focus",
    eyebrow: "The twelve · D7",
    items: DLIST,
    active: "D7",
    title: "What does this<br>endpoint return?",
    body: "The honest answer is “read the handler.” A hand-written API doc is accurate for one afternoon, and nobody is assigned to keep it true.",
    notes: "Ask how many have a current API document. Few hands — and the honest ones say the handler is the document. The cost is the frontend dev guessing, which loops back to D3.",
  },
  {
    id: "d8",
    kind: "focus",
    eyebrow: "The twelve · D8",
    items: DLIST,
    active: "D8",
    title: "CSV looks easy<br>until Monday.",
    body: "Export is a weekend job until Excel opens it. Import is a parser, a validator, and an error report the clinic's receptionist can act on.",
    notes: "The audience for an import error is not a developer. That is why it is work.",
  },
  {
    id: "d9",
    kind: "focus",
    eyebrow: "The twelve · D9",
    items: DLIST,
    active: "D9",
    title: "You build against<br>an empty database.",
    body: "Three test rows named “asdf”. Then Friday comes, and the demo needs a clinic that looks like a clinic — and there isn't one.",
    notes: "Everyone has demoed an app containing a patient called 'test test'. Let them remember that.",
  },
  {
    id: "d10",
    kind: "focus",
    eyebrow: "The twelve · D10",
    items: DLIST,
    active: "D10",
    title: "The amount column<br>is a float.",
    body: "It is a number, after all. The next slide is what the database thinks of that.",
    notes: "Set it up deadpan. The next slide is just arithmetic.",
  },
  {
    id: "d10-ex",
    kind: "statement",
    eyebrow: "D10 · the arithmetic",
    title: "0.07 + 0.07 + 0.07 = 0.21000000000000002",
    body: "Found months later, by whoever reconciles the bank statement. Fixed with a migration and a data repair, in production.",
    notes: "Read the number out, every digit. The laugh is in the digits. Then the second sentence, slowly — everyone who has done the production data repair goes quiet.",
  },
  {
    id: "d11",
    kind: "focus",
    eyebrow: "The twelve · D11",
    items: DLIST,
    active: "D11",
    title: "The admin panel<br>is the app.",
    body: "It is the screen the client spends their working day in — and it is built last, by whoever is free, out of whatever components are lying around.",
    notes: "The client does not live on your landing page. They live in the admin — the part that got one Friday.",
  },
  {
    id: "d12",
    kind: "focus",
    eyebrow: "The twelve · D12",
    items: DLIST,
    active: "D12",
    title: "Or you pay a model<br>to type it all.",
    body: "It works. It costs real tokens every time, the structure comes out different every time, and the model re-decides your conventions from nothing on every project.",
    notes: "Careful tone: this is not anti-AI. The agent is a great typist with no memory of your last project. Flare's answer, in the scorecard, is to hand the agent a grammar instead of a blank page.",
  },

  // ─── The eight ──────────────────────────────────────────────────────────────
  { id: "sec-biz", kind: "section", part: "Second", title: "Eight questions<br>from the client", note: "Asked before anyone mentions the feature. Every one is a quote.", notes: "Switch voice here: these are the client's words, not yours." },
  {
    id: "b-all",
    kind: "list",
    eyebrow: "In their words",
    items: BLIST,
    notes: "Read two or three in the client's voice — no more. Then the setup line for the section: the honest answer to every one of these is 'yes, in about three weeks', and the client hears that as a no.",
  },
  {
    id: "b1",
    kind: "focus",
    eyebrow: "The eight · B1",
    items: BLIST,
    active: "B1",
    title: "“Can different people<br>see different things?”",
    body: "Roles, then permissions, then per-record ownership — a receptionist books, a doctor reads, the owner sees money. It is always one layer deeper than the first conversation suggests.",
    notes: "Roles is easy, permissions is fine; per-record — a doctor sees their own patients — is where it becomes a week. And it must hold in the export too, not just the route.",
  },
  {
    id: "b2",
    kind: "focus",
    eyebrow: "The eight · B2",
    items: BLIST,
    active: "B2",
    title: "“What happens<br>if we get hacked?”",
    body: "They mean: is there a lock on the door? You hear: rate limits, bans, two-factor, an audit trail — none of which is in the estimate.",
    notes: "The gap between what they mean and what it costs is the slide. Don't resolve it yet.",
  },
  {
    id: "b3",
    kind: "focus",
    eyebrow: "The eight · B3",
    items: BLIST,
    active: "B3",
    title: "“Can we get everything<br>into Excel?”",
    body: "Every clinic has a spreadsheet person, and the system that cannot feed them is the system that quietly stops being used.",
    notes: "This is D8 wearing a suit. The client version of the same work.",
  },
  {
    id: "b4",
    kind: "focus",
    eyebrow: "The eight · B4",
    items: BLIST,
    active: "B4",
    title: "“Who changed this?”",
    body: "Asked exactly once — the day a price, a dose or a date is wrong and two people disagree about why. If the answer isn't in the system, the answer is a meeting.",
    notes: "Say the last line and pause. Everyone has been in that meeting.",
  },
  {
    id: "b5",
    kind: "focus",
    eyebrow: "The eight · B5",
    items: BLIST,
    active: "B5",
    title: "“Our staff photograph<br>things on their phones.”",
    body: "Nobody asks it as a question. It arrives as a bug report: ten megabytes each, over a connection that drops — and is the file even a photo?",
    notes: "Callback to D6: the renamed executable. Same work, now with the client watching.",
  },
  {
    id: "b6",
    kind: "focus",
    eyebrow: "The eight · B6",
    items: BLIST,
    active: "B6",
    title: "“Can we see it<br>before it's finished?”",
    body: "A reasonable ask that costs you a deploy, a staging environment, and a database that doesn't look embarrassing on a projector.",
    notes: "D9's empty database meets the client's calendar. The tunnel answers this one later.",
  },
  {
    id: "b7",
    kind: "focus",
    eyebrow: "The eight · B7",
    items: BLIST,
    active: "B7",
    title: "“What will the hosting<br>cost us?”",
    body: "A clinic in Kampala is not budgeting for a surprise invoice in dollars. “It depends on usage” is not an answer they can take to the owner.",
    notes: "This is the room's own first-slide worry, reflected back from the client's side. The Cloudflare answer comes in the deploy act.",
  },
  {
    id: "b8",
    kind: "focus",
    eyebrow: "The eight · B8",
    items: BLIST,
    active: "B8",
    title: "“Can we sign in<br>with Google?”",
    body: "And can the owner's phone unlock it, and can the nurse who forgot her password fix it herself at 7am without calling you?",
    notes: "The 7am detail matters: every forgotten password without self-service reset is a support call to you, forever.",
  },
  {
    id: "b-threeweeks",
    kind: "statement",
    eyebrow: "The honest answer to all eight",
    title: "“Yes — in about three weeks.”",
    body: "Which the client hears as a no. So each one is promised for phase two, and the audit log, the backups and the security are the phase two that never arrives.",
    notes: "This is the emotional low point of the talk, on purpose. Sit in it for a breath before the turn.",
  },

  // ─── Why these survive ──────────────────────────────────────────────────────
  {
    id: "why-libraries",
    kind: "statement",
    eyebrow: "Why these survive · 1 of 3",
    title: "The npm registry is superb. None of it is the shape.",
    body: "Next.js, Prisma, Drizzle, Zod, Better Auth, TanStack, Stripe, Resend — each solves one problem completely. Nobody hands you how they fit together, so the fit is hand-carved on every project.",
    notes: "Be genuinely complimentary — this room uses and loves these. The gap is not quality, it is scope: nothing answers 'what does an application made of these look like', and that assembly is where the two weeks go.",
  },
  {
    id: "why-templates",
    kind: "statement",
    eyebrow: "Why these survive · 2 of 3",
    title: "A template is a photograph of your opinions on one Tuesday.",
    body: "Boilerplates and copy-paste both freeze the bugs of the day you cloned them. The fix you make on project five never travels backwards.",
    notes: "Gently — most people here have a boilerplate repo they are fond of. It is not bad on day one; it just cannot improve.",
  },
  {
    id: "why-phase-two",
    kind: "statement",
    eyebrow: "Why these survive · 3 of 3",
    title: "The client's eight are always phase two.",
    body: "Each is real work with no demo attached, so each is promised for later. Audit, backups and security are the three that never arrive.",
    notes: "Nobody skips these out of ignorance. The feature is due Friday and none of these produce anything you can show a stakeholder — which is the precise definition of what belongs in a framework: expensive, invisible, always cut.",
  },
  {
    id: "the-question",
    kind: "statement",
    eyebrow: "So the question is not which library",
    title: "Can the shape of an app be generated, owned outright by you — and still improve after you own it?",
    body: "Three clauses, and they fight each other. Everything after this slide is the answer.",
    notes: "The hinge of the whole talk. Read it slowly and stop. Generated is easy — lots of tools. Generated and owned is harder. Generated, owned, and still improving is the actual problem, because the moment code is yours, nobody can fix it but you.",
  },

  // ─── The idea ───────────────────────────────────────────────────────────────
  { id: "sec-solution", kind: "section", part: "The turn", title: "Describe a resource", note: "One idea, one command, and everything the command wrote.", notes: "Energy up from here. The complaining is over." },
  {
    id: "solution",
    kind: "statement",
    eyebrow: "The whole idea",
    title: "Describe a resource.<br>Get the vertical slice.",
    body: "A patient is not nine decisions. It is **one decision with nine consequences** — and eight of them are mechanical.",
    notes: "The insight is not 'generate code' — lots of tools generate code. The unit matters: a resource is the thing that spans the stack. A patient is a table, a migration, validators, an API, a client, and four admin pages. One decision; the rest are consequences.",
  },
  {
    id: "solution-cmd",
    kind: "code",
    eyebrow: "One line",
    lang: "bash",
    code: `npx flare gen resource Patient --icon user-round --group Clinic \\
  --fields 'name:string!, phone:tel!, dateOfBirth:date,
            sex:enum(female,male), nationalId:string?,
            photo:file:[image]:5mb?, allergies:text?, address:string?'`,
    caption: "Eight fields. `!` is unique, `?` is optional, and `file:[image]:5mb` is an afternoon of upload work in eleven characters.",
    notes: "Read the command out loud, slowly. Point at tel — validated per country, E.164. Point at the file field: the bucket, the signed URL, the size cap and the leading-bytes check. That is D6, answered in the grammar.",
  },
  {
    id: "vs-patient",
    kind: "split",
    eyebrow: "What the other developer writes for the same table",
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
        "upload: bucket, signed URL, size, bytes",
      ],
      note: "11 files · 268 lines",
    },
    right: { heading: "Flare", items: ["the one command"], note: "1 line" },
    notes: "Both numbers are wc -l of real output, not estimates. Walk the left column top to bottom — the room should recognise every row — then point at the right.",
  },
  {
    id: "patient-bought",
    kind: "statement",
    eyebrow: "And notice",
    title: "D3 just disappeared.",
    body: "The model, the validators, the types and the form all derive from **one description**. There is no second spelling of `patient` to keep in step by memory.",
    notes: "Callback by number: D3 was 'types written four times'. Tick it off out loud — the scorecard at the end does this for all twelve, so plant the pattern now.",
  },
  {
    id: "solution-output",
    kind: "code",
    eyebrow: "What the command printed",
    lang: "text",
    code: `create   resources/patient.resource.ts
create   db/schema/patients.ts
create   migrations/0001_create_patients.sql
create   app/api/patients/route.ts
create   app/api/patients/[id]/route.ts
create   resources/patient.validators.ts
create   resources/patient.client.ts
create   app/dashboard/patients/page.tsx
create   app/dashboard/patients/new/page.tsx
create   app/dashboard/patients/[id]/page.tsx
+ edit page, loading skeletons, registry, relations`,
    caption: "Nineteen files. The next eight slides read the ones worth reading — because you are going to own all of them.",
    notes: "Don't read the list; let it sit. The phrase to say: 'you are going to own all of these', which is why the next section walks them.",
  },

  // ─── What one command wrote ─────────────────────────────────────────────────
  { id: "sec-out", kind: "section", part: "Part two", title: "What one<br>command wrote", note: "File by file. No magic — you can read every one of these tonight.", notes: "Pace tip: these eight slides should take six minutes, not fifteen. Point at one line per file." },
  {
    id: "gen-descriptor",
    kind: "code",
    eyebrow: "What it wrote · 1 of 8 · resources/patient.resource.ts",
    lang: "ts",
    code: `export default defineResource({
  name: "Patient",
  fields: {
    // generated:start hash=eabeb198dc66
    name: field.string(),
    phone: field.string({ format: "tel", unique: true }),
    sex: field.enum(["female", "male"]),
    photo: field.file(["image"], { required: false, maxBytes: 5242880 }),
    // generated:end
  },
});`,
    caption: "The source of truth — and the hash is how regeneration knows you edited it.",
    notes: "Point at the hash comment — it matters in concept three. Everything downstream derives from this file.",
  },
  {
    id: "gen-migration",
    kind: "code",
    eyebrow: "What it wrote · 2 of 8 · migrations/0001_create_patients.sql",
    lang: "sql",
    code: `CREATE TABLE \`patients\` (
  \`id\`     text PRIMARY KEY NOT NULL,
  \`name\`   text NOT NULL,
  \`phone\`  text NOT NULL,
  \`sex\`    text NOT NULL,
  \`photo\`  text,
  CONSTRAINT "patients_sex_check"
    CHECK("patients"."sex" in ('female','male'))
);
CREATE UNIQUE INDEX \`patients_phone_unique\` ON \`patients\` (\`phone\`);`,
    caption: "The enum became a CHECK constraint, because the database is where that rule belongs. Plain SQL you can read in review.",
    notes: "One beat: the constraint lives in the database, not only in the form. Reviewers can read this file like any migration they wrote themselves.",
  },
  {
    id: "gen-validators",
    kind: "statement",
    eyebrow: "What it wrote · 3 of 8",
    title: "Validators that refuse politely, and completely.",
    body: "Strict schemas: send a bad email, three decimals of money, a wrong enum **and** a field named `hacker`, and one 422 lists all four problems — including `Unknown field(s): hacker`.",
    notes: "That exact request was run; the four-problem 422 is real. Strict objects mean the API cannot be fed fields the descriptor never declared.",
  },
  {
    id: "gen-route",
    kind: "code",
    eyebrow: "What it wrote · 4 of 8 · app/api/patients/route.ts",
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
    caption: "No framework in it. Each guard is a named function, in order — a new developer follows the request without being told how it works.",
    notes: "Read it top to bottom in one breath: authorize, origin, parse, create. That is the whole route. Ctrl-click any of those names and you land in your own repo, not node_modules.",
  },
  {
    id: "gen-client",
    kind: "code",
    eyebrow: "What it wrote · 5 of 8",
    title: "resources/patient.client.ts — used anywhere",
    lang: "ts",
    code: `const { data, meta } = await patientClient.list({
  sort: "-createdAt",
  filter: { sex: "female" },
});

await patientClient.create({ name: "Aisha K.", phone: "+256700…", sex: "female" });`,
    caption: "Typed from the descriptor: `sex` is `\"female\" | \"male\"` here too. D3's four spellings are one spelling.",
    notes: "The type flows from the same descriptor, so the frontend cannot drift from the API. Tick D3 again if the room enjoys the ticking.",
  },
  {
    id: "gen-policy",
    kind: "code",
    eyebrow: "What it wrote · 6 of 8",
    title: "policies/patient.policy.ts",
    lang: "ts",
    code: `export default definePolicy({
  resource: "Patient",
  read:   ["admin"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
});`,
    caption: "Admin-only on arrival, and the first account to sign up becomes the admin. A patient record open to anyone who registers is not a bug you want to find in a clinic.",
    notes: "B1 and B2 start here: the API and the admin UI read this same file, so they cannot disagree. Per-record ownership is one more line — own: { field } — mention it, don't show it.",
  },
  {
    id: "gen-pages",
    kind: "statement",
    eyebrow: "What it wrote · 7 of 8",
    title: "Four admin pages, before lunch.",
    body: "A sortable, filterable table with CSV in and out. A multi-step form. A record page. Loading skeletons shaped like each of them. D11's “built last” panel — generated **first**.",
    notes: "If you demo anything live, demo this: the admin exists the moment the command finishes. The client's daily screen stopped being an afterthought.",
  },
  {
    id: "gen-openapi",
    kind: "statement",
    eyebrow: "What it wrote · 8 of 8",
    title: "The API documents itself at /api/reference.",
    body: "OpenAPI 3.1, generated from the same descriptors, filtered to what each role may call. D7's answer is no longer “read the handler.”",
    notes: "Last of the eight — and the one the next developer on the project thanks you for. Close the section: 'eight files, one description, and we have not written a line yet.'",
  },

  // ─── Four ideas ─────────────────────────────────────────────────────────────
  { id: "sec-concepts", kind: "section", part: "Part three", title: "The four ideas<br>underneath", note: "Why it works this way, in four claims you can disagree with.", notes: "Framing: 'you have seen what it does; here is why it is shaped like this.' Invite disagreement — it reads as confidence." },
  {
    id: "c1",
    kind: "statement",
    eyebrow: "C1 · the unit of generation",
    title: "The resource is the only thing that spans the whole stack.",
    body: "So it is the thing worth generating. Not a file. Not a layer. The **patient**, from the column to the form field.",
    notes: "The load-bearing idea — say it slowly. Generate a layer and you automated the easy bit. Generate the resource and the nine places agree by construction.",
  },
  {
    id: "c1-ex",
    kind: "statement",
    eyebrow: "C1 · and a field type is a decision made once",
    title: "money decides five things you never visit again.",
    body: "A column of integer minor units. A validator that rejects a third decimal. An input with the currency where the number is. A formatted table cell. An API that still speaks 1200.50.",
    notes: "D10, answered by the type system instead of by discipline. tel, file and enum each make the same kind of bundle of decisions — one word each.",
  },
  {
    id: "c2",
    kind: "statement",
    eyebrow: "C2 · nothing is hidden",
    title: "What shadcn/ui did for components — done to the backend.",
    body: "The engine is **copied into the app**: about 800 readable lines in `lib/resource/`, imported by every generated route. Your name on every file, nothing of Flare at runtime.",
    notes: "This is slide two's strike-through, explained. Ctrl-click createResourceStore on stage if you demo — landing in your own lib/ folder is the whole argument in one click.",
  },
  {
    id: "c3",
    kind: "statement",
    eyebrow: "C3 · owned, and still improving",
    title: "Remember “there is no mechanism”? This is the mechanism.",
    body: "`flare diff` shows how your copy differs from upstream. `flare update --yes` takes the fix — and refuses to run without being asked. Edit a generated block and the hash reports **drift**, not damage.",
    notes: "The D1-ex callback, word for word. This is also the answer to the hinge question's third clause — say so explicitly.",
  },
  {
    id: "c4",
    kind: "statement",
    eyebrow: "C4 · one description, two platforms",
    title: "The same seven descriptors run on Cloudflare or on Vercel.",
    body: "Workers, D1 and Drizzle — or Next.js, Neon Postgres and Prisma. Descriptors, policies, seeds and every dashboard component are the same file on both. Only the row adapter differs.",
    notes: "The first-slide worry, answered structurally: the app is not married to either bill. Deploy act shows the numbers.",
  },

  // ─── The build ──────────────────────────────────────────────────────────────
  { id: "sec-build", kind: "section", part: "Part four", title: "The clinic,<br>from an empty folder", note: "A real brief, seven tables, and the commands that are the whole build.", notes: "If there is a live demo, it is here. If not, the slides carry it — every output shown was really produced." },
  {
    id: "pick",
    kind: "statement",
    eyebrow: "The brief",
    title: "A clinic management system.",
    body: "Patients, bookings, visits, prescriptions, invoices. Everyone in this room has sat in a waiting room — nobody needs the domain explained.",
    notes: "One slide of setup, no more; the room already met the clinic in B1–B8.",
  },
  {
    id: "tables-all",
    kind: "cards",
    eyebrow: "The design work: seven tables",
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
    notes: "Point along the chain left to right: booked, seen, prescribed, invoiced, paid. The design is the work; everything after is mechanical.",
  },
  {
    id: "table-appointment",
    kind: "table",
    eyebrow: "One table in full · appointments",
    title: "The booking",
    head: ["Field", "Type", "Why"],
    rows: [
      ["patientId", "→ patients", "restrict: you cannot delete a booked patient"],
      ["doctorId", "→ doctors", "—"],
      ["scheduledFor", "date and time", "—"],
      ["status", "booked | arrived | seen | cancelled | noShow", "the front desk runs on this"],
      ["cancelledBecause", "text — **only when cancelled**", "an empty reason is a complaint waiting to happen"],
    ],
    notes: "One table in full; the other six read the same way and live in the docs. All the time goes on the last row.",
  },
  {
    id: "appt-cancel",
    kind: "statement",
    eyebrow: "That last row",
    title: "The field the brief forgot.",
    body: "Nobody asks for `cancelledBecause` in week zero. The clinic manager asks in week two, after the first argument at the front desk. Design it now, and it is one clause.",
    notes: "This is B4's cousin: the system answering a human dispute. The conditional grammar on the next slides is what makes it one clause instead of three files.",
  },
  {
    id: "field-cond",
    kind: "split",
    eyebrow: "if status == cancelled",
    left: {
      heading: "What the one clause does",
      items: ["the form shows the field only when it applies", "the validator requires it only when it applies", "the store **clears** it when it stops applying", "the column is nullable, always"],
    },
    right: {
      heading: "Why the third one matters",
      items: ["a booking is edited away from cancelled", "the form hides the reason", "so the request never mentions it", "and a stale reason stays in the row", "— unless the store owns the rule"],
    },
    notes: "Hiding an input stops the form sending a value; it does not remove the value already in the row. That is why this cannot live in the form — the rule's home is the store.",
  },
  {
    id: "cond-depth",
    kind: "statement",
    eyebrow: "A deliberate limit",
    title: "Conditions are one level deep. On purpose.",
    body: "A field depending on a field that is itself hidden makes the form guess — and there is no good guess. The generator refuses at generation time, not in production.",
    notes: "Checked when you generate: 'cancelled' must be one of the statuses or no file is written. Constraints announced as features read as honesty.",
  },
  {
    id: "cmd-anatomy",
    kind: "code",
    eyebrow: "The grammar, in one command",
    lang: "bash",
    code: `npx flare gen resource Appointment --icon calendar-clock --group Clinic \\
  --fields 'patient:belongsTo(Patient), doctor:belongsTo(Doctor),
            scheduledFor:datetime, reason:string,
            status:enum(booked,arrived,seen,cancelled,noShow),
            cancelledBecause:string if status == cancelled'`,
    caption: "`belongsTo` is a foreign key, its index and a picker. `enum` is a CHECK constraint and a dropdown. `!` unique · `?` optional · `if` conditional. The grammar **is** the design language.",
    notes: "Point at belongsTo: one word buys the foreign key, the restrict rule, the index and the searchable dropdown in the form. The command is the table design, read aloud.",
  },
  {
    id: "cmd-all",
    kind: "code",
    eyebrow: "The entire build",
    lang: "bash",
    code: `pnpm create flare-framework clinic && cd clinic

flare gen resource Patient      --fields 'name:string!, phone:tel!, …'
flare gen resource Doctor       --fields 'name:string!, email:email!, …'
flare gen resource Appointment  --fields '…, cancelledBecause:string if status == cancelled'
flare gen resource Visit        --fields '…, followUpOn:date if followUp == true'
flare gen resource Prescription --fields 'visit:belongsTo(Visit), drug:string!, …'
flare gen resource Invoice      --fields '…, amount:money, …'
flare gen resource Payment      --fields '…, claimNumber:string if method == insurance'

flare migrate && flare seed demo`,
    caption: "Seven lines, one per table — each a direct reading of the design. Nothing here was invented at the keyboard.",
    notes: "Read two of the seven aloud, not all. Point at seed demo: that is D9 — Friday's demo has a clinic that looks like a clinic.",
  },
  {
    id: "build-cycle",
    kind: "statement",
    eyebrow: "And when the brief changes",
    title: "Edit the descriptor. Run it again.",
    body: "Week two's new field goes into the descriptor; regeneration updates every file that derives from it — and anything you hand-edited is reported as drift, and skipped.",
    notes: "The loop is the product: generation is not a one-shot scaffold, it is how the app changes for its whole life. That is the difference from every scaffolder the room has used.",
  },
  {
    id: "build-running",
    kind: "statement",
    eyebrow: "What is on screen by now",
    title: "A sign-in page. An admin with seven tables. A seeded clinic.",
    body: "Sort a column, filter a status, export a CSV, upload a photo that is checked for really being one. Nobody has opened a component file yet.",
    notes: "If demoing: this is the moment to flip to the browser for sixty seconds, no more. Book an appointment, cancel it, show the reason field appear.",
  },
  {
    id: "tool-tunnel",
    kind: "statement",
    eyebrow: "B6, answered · flare dev --tunnel",
    title: "Show it before you ship it.",
    body: "Your local app on a public HTTPS link — no account, no DNS, no open ports. The client sees Friday's demo on Wednesday, from their own phone.",
    notes: "Callback B6 by number. One sentence of mechanics is enough; the value is the client's phone.",
  },
  {
    id: "tool-security",
    kind: "statement",
    eyebrow: "B2, answered · flare gen security",
    title: "A lock on the door, with a dashboard.",
    body: "Rate limits, bans and abuse detection in front of every request — plus the audit log that answers “who changed this?” without a meeting.",
    notes: "B2 and B4 in one slide. The phrase 'without a meeting' pays off B4's notes.",
  },
  {
    id: "tool-themes",
    kind: "statement",
    eyebrow: "And because clients compare notes",
    title: "Six themes, so no two of your apps look alike.",
    body: "`flare theme mono` — sign-in, dashboard, admin and home page all follow: colours, type, button shapes, even the sign-in layout.",
    notes: "The freelancer slide: two of your clients will eventually see each other's systems. Quick, light, move on.",
  },

  // ─── Ship it ────────────────────────────────────────────────────────────────
  { id: "sec-deploy", kind: "section", part: "Part five", title: "Ship it", note: "One command, and the question of whose bill it lands on.", notes: "Short act. The deploy output is real." },
  {
    id: "deploy-cmd",
    kind: "code",
    eyebrow: "The last command",
    lang: "text",
    code: `$ npx flare deploy

flare  Applying migrations to clinic-db (remote)
       0001_create_patients.sql ✓   … 0007_create_payments.sql ✓
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
    eyebrow: "One description, two homes",
    left: { heading: "Cloudflare", items: ["Workers, D1, R2", "no cold starts", "`flare deploy`"], note: "a small clinic: about £0/month" },
    right: { heading: "Next.js on Vercel", items: ["Neon Postgres, Prisma", "real Node, every npm package", "`flare deploy`"], note: "the default stack" },
    notes: "B7's answer, in numbers: a clinic this size rides Cloudflare's free tier; the paid plan is $5. On Vercel you pay more and get Postgres and Node. Same descriptors either way — C4.",
  },
  {
    id: "pick-db",
    kind: "statement",
    eyebrow: "If you only remember one rule",
    title: "Pick for the database.",
    body: "A schema holding real data is the one thing you cannot move in an afternoon. Everything else is either the same file on both stacks, or an afternoon.",
    notes: "This is genuinely useful advice independent of Flare — give it away freely, it buys trust for the scorecards.",
  },

  // ─── The accounting ─────────────────────────────────────────────────────────
  { id: "sec-score", kind: "section", part: "The accounting", title: "Twenty problems,<br>accounted for", note: "The twelve and the eight, one answer each. Then what is not finished.", notes: "This is the payoff structure of the whole talk: every number from acts one and two gets its line." },
  {
    id: "scorecard-d1",
    kind: "scorecard",
    eyebrow: "The twelve · first half",
    title: "D1 – D6",
    rows: [
      { code: "D1", label: "The copy-paste start", answer: "generated fresh, with an upstream: `flare update`" },
      { code: "D2", label: "The template you bought", answer: "`flare diff` — the fix can finally travel" },
      { code: "D3", label: "Types written four times", answer: "one descriptor; schema, validators, types derived" },
      { code: "D4", label: "The same table, again", answer: "generated per resource: sort, filter, page" },
      { code: "D5", label: "Auth, the sixth time", answer: "Better Auth wired: sessions, reset, 2FA, passkeys" },
      { code: "D6", label: "Uploads, never simple", answer: "`file:[image]:5mb` — bucket, URL, byte check" },
    ],
    notes: "Read the left column only; the right column is for the photo people take. Same on the next two slides.",
  },
  {
    id: "scorecard-d2",
    kind: "scorecard",
    eyebrow: "The twelve · second half",
    title: "D7 – D12",
    rows: [
      { code: "D7", label: "The undocumented API", answer: "OpenAPI 3.1, generated, at /api/reference" },
      { code: "D8", label: "CSV, both directions", answer: "import and export, per resource" },
      { code: "D9", label: "No data to build against", answer: "`flare seed demo`" },
      { code: "D10", label: "Money as a float", answer: "`money`: integer minor units, one seam" },
      { code: "D11", label: "The admin nobody budgets", answer: "four pages per table, generated first" },
      { code: "D12", label: "Paying a model to write it", answer: "the agent gets a grammar, not a blank page" },
    ],
    notes: "On D12: there is an installable skill and an llms.txt — the agent reads the field grammar and the rules instead of re-inventing your conventions. The AI hook from slide five, closed.",
  },
  {
    id: "scorecard-b",
    kind: "scorecard",
    eyebrow: "The eight",
    title: "The client's questions, with answers that are not “phase two”",
    rows: [
      { code: "B1", label: "Different people, different things", answer: "a policy per table; `own` for per-record" },
      { code: "B2", label: "If we get hacked", answer: "rate limits, bans, 2FA — and the audit log" },
      { code: "B3", label: "Everything into Excel", answer: "CSV, both directions" },
      { code: "B4", label: "Who changed this", answer: "the audit log, not a meeting" },
      { code: "B5", label: "Ten-megabyte phone photos", answer: "size caps, and the bytes are checked" },
      { code: "B6", label: "See it before it's finished", answer: "`flare dev --tunnel` + `flare seed demo`" },
      { code: "B7", label: "What hosting costs", answer: "Cloudflare: ~$5/month, and a cost estimator" },
      { code: "B8", label: "Sign in with Google", answer: "Google, GitHub, Apple, Microsoft · passkeys · magic links" },
    ],
    notes: "Eight rows, read three: B4, B7 and whichever got the biggest reaction in act two. Then: 'none of these was phase two — they were in the folder before the first feature.'",
  },
  {
    id: "honest",
    kind: "split",
    eyebrow: "And the part that is not finished",
    left: { heading: "Not there yet", items: ["no multi-tenancy — one clinic per app", "no field-level permissions", "no plugin system", "realtime is Cloudflare-only"], note: "on the roadmap, publicly" },
    right: { heading: "Known costs", items: ["pre-1.0: the format can still move", "the Cloudflare stack runs on a beta runtime", "one maintainer", "181 files before you add anything"], note: "written down in the docs" },
    caption: "A framework that only lists its strengths is asking you to find the weaknesses yourself, on your own project, at your own cost.",
    notes: "Do not rush this slide — it buys more credibility than any scorecard. If someone asks about multi-tenancy in Q&A, the answer is honest: one clinic per app today, orgs are the roadmap's next big item.",
  },
  {
    id: "closing-statement",
    kind: "statement",
    eyebrow: "The question, answered",
    title: "Generated. Owned. Still improving.",
    body: "The shape is generated from your tables. It lands in your repository, under your name. And `flare diff` means owning it is not the end of it getting better.",
    notes: "The hinge question's three clauses, answered in three words. Slow. This is the sentence you want quoted.",
  },
  {
    id: "try",
    kind: "statement",
    eyebrow: "Tonight",
    title: '<code class="inline">pnpm create flare-framework clinic</code>',
    body: "Node 22 and pnpm. By the time the kettle boils, you are signing in to your own admin. And bring your questions to the GitHub issues — the limits slide was not decoration.",
    notes: "One command, one promise, one invitation to the issues. Then thank-you.",
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
