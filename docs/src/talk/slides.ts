import type { Section, Slide } from "./types";

/**
 * The talk.
 *
 * Problem first, framework second. The first half is twenty things that go wrong on every
 * project whether or not anyone has heard of Flare; the second half is what one
 * description can be made to produce. The live build is the middle of the talk, not the
 * end, because a demo is evidence for an argument rather than the argument.
 *
 * Numbers and commands here are the ones that actually ran. If a figure changes, change
 * it here rather than saying it differently on stage.
 */
export const sections: Section[] = [
  { id: "cover", title: "The question", blurb: "What a project costs before the first real feature." },
  { id: "sec-dev", title: "The developer's problem", blurb: "Twelve things that cost the first fortnight." },
  { id: "sec-biz", title: "The client's questions", blurb: "Eight questions asked before anyone mentions a feature." },
  { id: "why-libraries", title: "Why libraries don't close it", blurb: "Twenty problems survive a decade of good packages." },
  { id: "sec-solution", title: "Describe it once", blurb: "One descriptor, a whole vertical slice." },
  { id: "gen-model", title: "What it wrote", blurb: "Every file one description produced, one at a time." },
  { id: "sec-concepts", title: "Four ideas", blurb: "What the whole thing rests on." },
  { id: "sec-build", title: "Let's build one", blurb: "A client billing system, empty folder to deployed." },
  { id: "sec-deploy", title: "The last mile", blurb: "The same descriptors, on two platforms." },
  { id: "scorecard-d", title: "The scorecard", blurb: "Twenty problems accounted for, honestly." },
];

export const slides: Slide[] = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: "cover",
    kind: "cover",
    event: "JS Meetup · 2026",
    title: "Flare",
    tagline: "Describe a resource once. Own every file it writes. Deploy it to two platforms.",
    speaker: "Muke JohnBaptist",
  },
  {
    id: "hook",
    kind: "statement",
    eyebrow: "A question",
    title: "How long before you write the first line that is actually about the thing you were hired to build?",
    body: "Not the first line you type. Auth, a database, uploads, an admin table with sorting and filters, a deploy that works — the first line about the business.",
  },
  {
    id: "hook-ai",
    kind: "statement",
    eyebrow: "The same question, for the agent",
    title: "And when you hand that setup to a coding agent: what does it cost, and does it come out the same way twice?",
    body: "Tokens are the half you can measure. The other half is whether the second project has the same shape, the same auth and the same conventions as the first — or whether you now maintain two dialects.",
  },

  // ─── Part one: the developer's problem ──────────────────────────────────────
  { id: "sec-dev", kind: "section", part: "Part one", title: "The developer's<br>problem", range: "D1 – D12" },
  {
    id: "d-all",
    kind: "list",
    eyebrow: "The list",
    items: [
      { code: "D1", label: "The copy-paste start" },
      { code: "D2", label: "Choosing the stack too early" },
      { code: "D3", label: "The same type, four times" },
      { code: "D4", label: "Every table, again" },
      { code: "D5", label: "The admin nobody budgeted for" },
      { code: "D6", label: "Auth is a fortnight" },
      { code: "D7", label: "Uploads need a bouncer" },
      { code: "D8", label: "The API nobody wrote down" },
      { code: "D9", label: "Nothing to build against" },
      { code: "D10", label: "Migrations with no way back" },
      { code: "D11", label: "Money in a float" },
      { code: "D12", label: "Paying a model to write it" },
    ],
  },
  {
    id: "d1",
    kind: "problem",
    code: "D1",
    title: "The copy-paste start",
    body: "You open the last project and start pasting. Auth, file storage, email. You wrote them already, and writing a session refresh from scratch a sixth time is worse than copying it — right up until the copy and the original disagree.",
  },
  {
    id: "d2",
    kind: "problem",
    code: "D2",
    title: "Choosing the stack before you know the app",
    body: "Next on Vercel or Workers on Cloudflare. Prisma or Drizzle. Postgres or SQLite. You pick on day one, with the least information you will ever have, and every file after that assumes the answer.",
  },
  {
    id: "d3",
    kind: "problem",
    code: "D3",
    title: "The same type, written four times",
    body: "The column, the validator, the API response, the form state. Four descriptions of one idea, in four files, and nothing tells you when the fourth stops agreeing with the first.",
  },
  {
    id: "d3-ex",
    kind: "code",
    eyebrow: "D3 · the four places",
    lang: "ts",
    code: `// the column
amount  Decimal  @db.Decimal(10, 2)

// the validator
amount: z.number().positive()

// the API type
interface Invoice { amount: number }

// the form
const [amount, setAmount] = useState("")`,
    caption: "Change the precision in the first and nothing anywhere tells you about the other three. The bug arrives as a rounding complaint from accounts, six weeks later.",
  },
  {
    id: "d4",
    kind: "problem",
    code: "D4",
    title: "Every table, again",
    body: "Sorting. Filtering. Paging that does not fall apart at ten thousand rows. Search. CSV out, and CSV in, which is harder. You build it for invoices, then again for clients, then again for payments.",
  },
  {
    id: "d5",
    kind: "problem",
    code: "D5",
    title: "The admin panel nobody budgeted for",
    body: "Every app needs one and no estimate includes it. So it gets built last, by whoever is free, and it is the screen the client actually spends their day in.",
  },
  {
    id: "d6",
    kind: "problem",
    code: "D6",
    title: "Auth is a fortnight",
    body: "Sign-up, sign-in, sessions, password reset, email verification, OAuth, two-factor, passkeys. Each is a day. None is the thing you were hired to build, and getting one subtly wrong is the headline.",
  },
  {
    id: "d7",
    kind: "problem",
    code: "D7",
    title: "Uploads need a bouncer",
    body: "A bucket, signed URLs, a size limit, and a check on what is actually in the file rather than what the name claims. Most projects ship the first two and call it done.",
  },
  {
    id: "d7-ex",
    kind: "statement",
    eyebrow: "D7 · what gets skipped",
    title: "Checking the extension is not checking the file.",
    body: "A renamed executable has the extension you asked for. Reading the leading bytes is four lines, and it is the four lines nobody writes at 6pm on a Friday.",
  },
  {
    id: "d8",
    kind: "problem",
    code: "D8",
    title: "The API nobody wrote down",
    body: "The mobile developer asks what the endpoints are. The answer is in the route files. You promise a document, and you mean it, and the document is right for about a week.",
  },
  {
    id: "d9",
    kind: "problem",
    code: "D9",
    title: "Nothing to build against",
    body: "An empty table tells you nothing about a table component. So you type six rows by hand, and the layout that looked fine at six rows is unusable at six hundred.",
  },
  {
    id: "d10",
    kind: "problem",
    code: "D10",
    title: "Migrations with no way back",
    body: "The migration ran in production and dropped a column that still had data in it. There is a backup, probably. This is the only item on this list that can end a company.",
  },
  {
    id: "d11",
    kind: "problem",
    code: "D11",
    title: "Money in a float",
    body: "Three 7p items come to 0.21000000000000002. A column of prices drifts the same way, and the total comes out a penny short — which is fine until somebody reconciles it against a bank statement.",
  },
  {
    id: "d11-ex",
    kind: "code",
    eyebrow: "D11 · the arithmetic",
    lang: "js",
    code: `> 0.07 + 0.07 + 0.07
0.21000000000000002

> [19.99, 19.99, 19.99].reduce((a, b) => a + b, 0)
59.97   // fine

// Nothing in the prices tells you which kind you have.`,
    caption: "Plenty of sums happen to come out right, which is exactly what makes this hard to find. The fix is to stop storing money in a float at all.",
  },
  {
    id: "d12",
    kind: "problem",
    code: "D12",
    title: "Paying a model to write it",
    body: "An agent can write all of the above. It will, every time, slightly differently — and you pay for the tokens twice: once to generate it and once, later, to read it and work out what it decided.",
  },

  // ─── Part two: the client's questions ───────────────────────────────────────
  { id: "sec-biz", kind: "section", part: "Part two", title: "The client's<br>questions", range: "B1 – B8", note: "Asked before anyone mentions a feature. Each one can end the project." },
  {
    id: "b-all",
    kind: "list",
    eyebrow: "The list",
    items: [
      { code: "B1", label: "What does it cost to run?" },
      { code: "B2", label: "Can we get our data out?" },
      { code: "B3", label: "Who can see what?" },
      { code: "B4", label: "Can it take payments?" },
      { code: "B5", label: "Does it work on a phone?" },
      { code: "B6", label: "How do we know it is secure?" },
      { code: "B7", label: "What if you are not available?" },
      { code: "B8", label: "When can we show someone?" },
    ],
  },
  { id: "b1", kind: "problem", code: "B1", title: "What does it cost to run?", body: "Not a guess. A number, for a hundred users and for a hundred thousand, with the line where it changes." },
  { id: "b2", kind: "problem", code: "B2", title: "Can we get our data out?", body: "They are asking whether leaving you is possible. Answering it well is how you get kept." },
  { id: "b3", kind: "problem", code: "B3", title: "Who can see what?", body: "Not roles in the abstract. Can the accounts clerk see other people's invoices, yes or no, and where is that written down." },
  { id: "b4", kind: "problem", code: "B4", title: "Can it take payments?", body: "Subscriptions, one-off checkout, a billing portal, and the webhook that keeps the database agreeing with the payment provider." },
  { id: "b5", kind: "problem", code: "B5", title: "Does it work on a phone?", body: "The admin panel too. The person approving invoices is doing it from a car park." },
  { id: "b6", kind: "problem", code: "B6", title: "How do we know it is secure?", body: "Not a promise. A default: what is open before you remember to close it." },
  { id: "b7", kind: "problem", code: "B7", title: "What if you are not available?", body: "Can someone else read this code. The honest version of the question is whether the project survives you." },
  { id: "b8", kind: "problem", code: "B8", title: "When can we show someone?", body: "Not launch. A screen with their own data in it, this week, that makes the rest of the budget easy to sign off." },
  {
    id: "b8-ex",
    kind: "statement",
    eyebrow: "B8 · why it is first, not last",
    title: "The demo is not the reward for finishing. It is how the project gets funded.",
    body: "Eight of those questions are answered by infrastructure that has nothing to do with the client's business, and all eight are asked before the business is discussed.",
  },

  // ─── Why libraries don't close it ───────────────────────────────────────────
  { id: "why-libraries", kind: "section", part: "Part three", title: "Why a decade of<br>good libraries<br>did not close it", note: "Every one of those twenty problems has an excellent package. The problems are still there." },
  {
    id: "why-glue",
    kind: "statement",
    eyebrow: "The reason",
    title: "The libraries are good. The glue is the work, and the glue is different every time.",
    body: "Zod validates. Drizzle queries. Better Auth signs people in. None of them knows that an invoice has an amount, so the fact that an invoice has an amount gets written out again for each of them — by you.",
  },
  {
    id: "why-templates",
    kind: "statement",
    eyebrow: "And the other answer",
    title: "A starter template is right once, on the day you clone it.",
    body: "Then it is a fork. Upstream fixes a session bug six months later and there is no mechanism that brings it to you, because by then your copy and theirs have drifted past recognising each other.",
  },

  // ─── The solution ───────────────────────────────────────────────────────────
  { id: "sec-solution", kind: "section", part: "Part four", title: "Describe it once", note: "The description is the only place the fact lives. Everything else is derived from it." },
  {
    id: "solution",
    kind: "code",
    eyebrow: "The whole input",
    title: "resources/invoice.resource.ts",
    lang: "ts",
    code: `export default defineResource({
  name: "Invoice",
  fields: {
    number:   field.string({ unique: true }),
    client:   field.belongsTo("Client"),
    amount:   field.float({ format: "money" }),
    status:   field.enum(["draft", "sent", "paid"]),
    dueOn:    field.date(),
    pdf:      field.file(["pdf"], { required: false }),
  },
});`,
    caption: "Twelve lines. Every fact about an invoice, in the only place it is written down.",
  },
  {
    id: "solution-cmd",
    kind: "code",
    eyebrow: "The whole command",
    lang: "bash",
    code: `npx flare gen resource Invoice \\
  --fields 'number:string!, client:belongsTo(Client), amount:money,
            status:enum(draft,sent,paid), dueOn:date, pdf:file:[pdf]?'`,
    caption: "Or write the descriptor by hand. The grammar is a convenience, not a layer — it produces exactly the file above.",
  },
  {
    id: "solution-output",
    kind: "list",
    eyebrow: "What comes out",
    items: [
      { code: "01", label: "The table and its migration" },
      { code: "02", label: "Strict Zod validators" },
      { code: "03", label: "A REST API, paged and filtered" },
      { code: "04", label: "A typed client" },
      { code: "05", label: "An admin table with CSV" },
      { code: "06", label: "A multi-step form" },
      { code: "07", label: "A record page with its children" },
      { code: "08", label: "Loading skeletons for each" },
      { code: "09", label: "A policy file, admin-only" },
      { code: "10", label: "An entry in the OpenAPI document" },
    ],
  },

  // ─── Generated files, one at a time ─────────────────────────────────────────
  { id: "gen-model", kind: "section", part: "Part five", title: "What it wrote", note: "Nineteen files. Worth seeing, because you are going to own all of them." },
  {
    id: "gen-schema",
    kind: "code",
    eyebrow: "01 · the table",
    title: "db/schema/invoices.ts",
    lang: "ts",
    code: `export const invoices = sqliteTable("invoices", {
  id:       text("id").primaryKey(),
  number:   text("number").notNull(),
  clientId: text("client_id").notNull()
              .references(() => clients.id, { onDelete: "restrict" }),
  amount:   integer("amount").notNull(),
  status:   text("status").notNull(),
});`,
    caption: "`amount` is an integer, not a real. A money column holds whole minor units — that is D11, decided once, in the field type.",
  },
  {
    id: "gen-migration",
    kind: "code",
    eyebrow: "02 · the migration",
    title: "migrations/0003_create_invoices.sql",
    lang: "sql",
    code: `CREATE TABLE \`invoices\` (
  \`number\` text NOT NULL,
  \`amount\` integer NOT NULL,
  \`status\` text NOT NULL,
  CONSTRAINT "invoices_status_check"
    CHECK("invoices"."status" in ('draft','sent','paid'))
);
CREATE UNIQUE INDEX \`invoices_number_unique\` ON \`invoices\` (\`number\`);`,
    caption: "The enum became a CHECK constraint and the unique became an index, because the descriptor said so and SQL is where that belongs.",
  },
  {
    id: "gen-route",
    kind: "code",
    eyebrow: "03 · the route",
    title: "app/api/invoices/route.ts",
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
    caption: "Each guard is a named function, in order, top to bottom. A junior developer or an agent can follow this without guessing.",
  },
  {
    id: "gen-policy",
    kind: "code",
    eyebrow: "04 · the policy",
    title: "policies/invoice.policy.ts",
    lang: "ts",
    code: `export default definePolicy({
  resource: "Invoice",
  read:   ["admin"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
});`,
    caption: "Admin-only on arrival. Widening it is a visible edit to a file that is already there — which is the opposite of forgetting to add one.",
  },
  {
    id: "gen-client",
    kind: "code",
    eyebrow: "05 · the typed client",
    title: "resources/invoice.client.ts",
    lang: "ts",
    code: `const page = await invoices.list({
  filter: { status: "overdue" },
  sort: "-dueOn",
  perPage: 50,
});

page.data[0].amount   // number, in the units people write
page.meta.nextCursor  // keyset, not an offset`,
    caption: "Your components never build a URL, and never guess a field name. Rename a field in the descriptor and this stops compiling.",
  },

  // ─── Four ideas ─────────────────────────────────────────────────────────────
  { id: "sec-concepts", kind: "section", part: "Part six", title: "Four ideas", range: "C1 – C4" },
  {
    id: "c1",
    kind: "statement",
    eyebrow: "C1 · the unit of generation",
    title: "A resource is the only thing that spans the whole stack.",
    body: "So it is the thing worth generating. Not a file, not a layer. The invoice — from the column to the form field.",
  },
  {
    id: "c1-ex",
    kind: "statement",
    eyebrow: "C1 · a field type is a decision made once",
    title: "money · belongsTo · file · markdown · tags · enum · percent · rating · country · tel · json · slug",
    body: "`money` decides a column type, a TypeScript type, a Zod rule, an input, how the number is shown in a table cell, and that it is stored in whole minor units. One word, six consequences, no chance for them to disagree.",
  },
  {
    id: "c2",
    kind: "statement",
    eyebrow: "C2 · what you are handed",
    title: "There is no framework in your route.",
    body: "Drizzle or Prisma, Zod, and the code you would have written. Ctrl-click `createResourceStore` and you are in your own repository — about 1,200 lines of it, which you can read on a train.",
  },
  {
    id: "c2-ex",
    kind: "split",
    eyebrow: "C3 · the line is a list, not a feeling",
    left: { heading: "Flare owns", items: ["the resource store", "the query parser", "the row adapters", "password hashing", "the upload guard", "the audit chain"], note: "rewritten on `flare update`" },
    right: { heading: "You own", items: ["your descriptors", "your policies", "your routes", "your pages", "your migrations", "your seeds"], note: "never touched" },
    caption: "Edit one of ours and a hash in the generated block notices. It is reported as drift and skipped — not overwritten, and not silent.",
  },
  {
    id: "c3",
    kind: "statement",
    eyebrow: "C3 · the hard clause",
    title: "Your code is yours. The engine half still gets fixed.",
    body: "`flare diff` shows what moved upstream. `flare update` takes the parts you choose. A starter template cannot do this, because a fork has no mechanism to bring you a fix.",
  },
  {
    id: "c4",
    kind: "statement",
    eyebrow: "C4 · why the other three work",
    title: "Convention is what makes it possible.",
    body: "One folder layout. One response envelope. One place a route is registered. A generator cannot write into a project whose shape it has to ask about.",
  },
  {
    id: "c4-ex",
    kind: "split",
    eyebrow: "C4 · and why there are two stacks",
    left: { heading: "Cloudflare", items: ["Workers", "D1 + Drizzle", "R2, KV, Durable Objects", "nothing to install"], note: "cheapest to run" },
    right: { heading: "Next.js", items: ["Next 16 on Vercel", "Postgres + Prisma", "R2, Upstash", "docker compose up -d"], note: "the default" },
    caption: "The descriptors, the policies, the hooks, the seeds and every dashboard component are the same file on both. Only the row adapter differs.",
  },

  // ─── Live build ─────────────────────────────────────────────────────────────
  { id: "sec-build", kind: "section", part: "Part seven", title: "Let's build one", note: "A client billing system. Empty folder to deployed, with all of the above in it." },
  {
    id: "build-what",
    kind: "split",
    eyebrow: "What we are building",
    left: { heading: "The chain", items: ["Client — with a photo", "Project — belongs to a client", "Invoice — belongs to a project", "Payment — belongs to an invoice"] },
    right: { heading: "The awkward bits", items: ["money that must not drift", "a file upload", "a field that only sometimes applies", "an admin who is not everyone"] },
    caption: "Four linked resources is the smallest thing that is honestly an application rather than a to-do list.",
  },
  {
    id: "build-0",
    kind: "code",
    eyebrow: "Step zero · the project",
    lang: "bash",
    code: `$ pnpm create flare-framework billing
$ cd billing
$ docker compose up -d     # Postgres, MinIO, Redis`,
    caption: "Next.js is the default. The compose file comes with the app and `.env` already points at it, so there is nothing to edit before the first run.",
  },
  {
    id: "build-1",
    kind: "code",
    eyebrow: "Step one · the client, with a photo",
    lang: "bash",
    code: `$ npx flare gen resource Client --icon users --group Billing \\
    --fields 'name:string!, email:email!, phone:tel?,
              company:string?, avatar:file:[image]:5mb?,
              country:country?, notes:text?'`,
    caption: "`file:[image]:5mb` is the bucket, the signed URL, the size limit and the leading-bytes check. That is D7, in eighteen characters.",
  },
  {
    id: "build-2",
    kind: "code",
    eyebrow: "Step two · the project, and the interesting field",
    lang: "bash",
    code: `$ npx flare gen resource Project --fields \\
    'name:string!, client:belongsTo(Client),
     kind:enum(oneOff,recurring),
     billingCycle:enum(monthly,annually) if kind == recurring,
     rate:money, status:enum(active,paused,done), startedOn:date'`,
    caption: "A billing cycle is required on a recurring project and meaningless on a one-off one. Say it where the field is declared, not in a useEffect.",
  },
  {
    id: "build-cond",
    kind: "split",
    eyebrow: "One declaration, three readers",
    left: {
      heading: "What it does",
      items: ["the form shows the input only when it applies", "the validator requires it only when it applies", "the store nulls it when it stops applying"],
    },
    right: {
      heading: "Why the third one matters",
      items: ["hiding an input stops the form sending a value", "it does not remove the value already in the row", "switch to one-off and last month's cycle would sit there", "unreachable from the UI that stopped showing it"],
    },
    caption: "That is the reason this cannot live in the admin form. The column is nullable too — the field is genuinely absent the rest of the time.",
  },
  {
    id: "build-3",
    kind: "code",
    eyebrow: "Step three · the rest of the chain",
    lang: "bash",
    code: `$ npx flare gen resource Invoice --fields \\
    'number:string!, project:belongsTo(Project), issuedOn:date,
     dueOn:date, amount:money, status:enum(draft,sent,paid,overdue)'

$ npx flare gen resource Payment --fields \\
    'invoice:belongsTo(Invoice), amount:money, paidOn:date,
     method:enum(bankTransfer,card,mobileMoney,cash)'`,
    caption: "In dependency order. A belongsTo pointing at a resource that does not exist yet is an error before anything is written.",
  },
  {
    id: "build-4",
    kind: "code",
    eyebrow: "Step four · schema, and something to look at",
    lang: "bash",
    code: `$ npx prisma migrate dev --name init
$ npx flare seed demo

  3 clients, 4 projects, 5 invoices, 3 payments
  sign in as admin@example.com / correct-horse-battery`,
    caption: "That is D9. `seedUser` writes the credential account too, so the demo has somebody to sign in as — which is harder by hand than it sounds.",
  },
  {
    id: "build-money",
    kind: "code",
    eyebrow: "What the database actually holds",
    lang: "sql",
    code: `SELECT name, kind, billing_cycle, rate FROM projects;

 Coffee — monthly retainer  | recurring |  monthly  | 120000
 Coffee — site rebuild      | oneOff    |           | 450000
 Northwind — fleet dash     | recurring |  annually | 980000`,
    caption: "120000 is £1,200.00. Null where the cycle does not apply. You send 1200.50 and read 1200.50 back — only the column sees cents.",
  },
  {
    id: "build-secure",
    kind: "code",
    eyebrow: "Step five · who can see it",
    lang: "bash",
    code: `# the first account to exist becomes the admin
GET /api/invoices  as founder@…   ->  200

# everybody after is just a user
GET /api/invoices  as someone@…   ->  403`,
    caption: "No configuration. A generated resource is admin-only, and the person who set the app up is the admin. That is B3 and B6, by default rather than by memory.",
  },
  {
    id: "build-running",
    kind: "list",
    eyebrow: "What is running, twenty minutes in",
    items: [
      { code: "01", label: "Four tables, migrated" },
      { code: "02", label: "A REST API with paging" },
      { code: "03", label: "Sixteen admin screens" },
      { code: "04", label: "Sign-in, 2FA, passkeys" },
      { code: "05", label: "Uploads to a real bucket" },
      { code: "06", label: "CSV in and out" },
      { code: "07", label: "An OpenAPI reference" },
      { code: "08", label: "An audit log" },
    ],
  },

  // ─── Deploy ─────────────────────────────────────────────────────────────────
  { id: "sec-deploy", kind: "section", part: "Part eight", title: "The last mile", note: "The same descriptors, on two platforms, from one repository." },
  {
    id: "deploy-cmd",
    kind: "code",
    eyebrow: "Deploying",
    lang: "bash",
    code: `# Next.js
$ npx flare deploy            # build, push, migrate

# the same app, on Workers
$ npx flare deploy --remote   # D1, R2 and KV provisioned on first run`,
    caption: "Migrations run before the deploy when they add something the new code needs, and after when they drop something the old code still uses. No tool can decide that for you, and Flare does not pretend to.",
  },
  {
    id: "deploy-cost",
    kind: "split",
    eyebrow: "B1 · what it costs to run",
    left: { heading: "Cloudflare", items: ["Workers free tier: 100k requests/day", "D1: 5GB", "R2: no charge for bandwidth out"], note: "a small app: £0" },
    right: { heading: "Vercel + Neon", items: ["Hobby: fine for a demo", "Neon free tier: 0.5GB", "R2 still serves the files"], note: "a small app: £0–20" },
    caption: "An answer with a number in it, and the line where it changes. `flare costs` prints this for your own app rather than for a slide.",
  },

  // ─── Scorecard ──────────────────────────────────────────────────────────────
  {
    id: "scorecard-d",
    kind: "scorecard",
    eyebrow: "Part nine · the accounting",
    title: "The developer's twelve",
    rows: [
      { code: "D1", label: "The copy-paste start", answer: "one command, not a clipboard" },
      { code: "D2", label: "Choosing the stack too early", answer: "the descriptor is the same on both" },
      { code: "D3", label: "The same type, four times", answer: "one descriptor, derived everywhere" },
      { code: "D4", label: "Every table, again", answer: "generated, with CSV and saved views" },
      { code: "D5", label: "The admin nobody budgeted for", answer: "four screens per resource" },
      { code: "D6", label: "Auth is a fortnight", answer: "Better Auth, wired, with 2FA and passkeys" },
      { code: "D7", label: "Uploads need a bouncer", answer: "`file:[image]:5mb`" },
      { code: "D8", label: "The API nobody wrote down", answer: "OpenAPI 3.1 at /api/reference" },
      { code: "D9", label: "Nothing to build against", answer: "`flare seed:resource Invoice 1000`" },
      { code: "D10", label: "Migrations with no way back", answer: "destructive statements refused unless named" },
      { code: "D11", label: "Money in a float", answer: "whole minor units, converted at one seam" },
      { code: "D12", label: "Paying a model to write it", answer: "generated the same way twice, with a skill" },
    ],
  },
  {
    id: "scorecard-b",
    kind: "scorecard",
    eyebrow: "The accounting",
    title: "The client's eight",
    rows: [
      { code: "B1", label: "What does it cost to run?", answer: "`flare costs`, with the line where it changes" },
      { code: "B2", label: "Can we get our data out?", answer: "CSV per resource; the database is yours" },
      { code: "B3", label: "Who can see what?", answer: "a policy file per resource, admin-only by default" },
      { code: "B4", label: "Can it take payments?", answer: "`flare gen billing` — Stripe, portal, webhooks" },
      { code: "B5", label: "Does it work on a phone?", answer: "the admin included" },
      { code: "B6", label: "How do we know it is secure?", answer: "closed by default; `flare gen security`" },
      { code: "B7", label: "What if you are not available?", answer: "no framework in the handler to learn" },
      { code: "B8", label: "When can we show someone?", answer: "this afternoon, with their own data in it" },
    ],
  },
  {
    id: "honest",
    kind: "split",
    eyebrow: "And the part that is not finished",
    left: { heading: "Not there yet", items: ["no multi-tenancy", "no field-level permissions", "no plugin system", "realtime is Cloudflare-only"], note: "on the roadmap, publicly" },
    right: { heading: "Known costs", items: ["pre-1.0: the format can still move", "the Cloudflare stack runs on a beta runtime", "one maintainer", "181 files in a new app"], note: "written down in the docs" },
    caption: "A framework that only lists its strengths is asking you to find the weaknesses yourself, on your own project, at your own cost.",
  },
  {
    id: "closing-statement",
    kind: "statement",
    eyebrow: "The claim",
    title: "Describe it once. Own every file. Deploy it to either platform.",
    body: "Not magic that runs from node_modules — code in your repository, with a diff tool for the day the generator changes its mind.",
  },
  {
    id: "close",
    kind: "cover",
    event: "Thank you",
    title: "Flare",
    tagline: "pnpm create flare-framework myapp  ·  flare-docs.codetotech.com  ·  github.com/MUKE-coder/flare-framework",
    speaker: "Muke JohnBaptist",
  },
];
