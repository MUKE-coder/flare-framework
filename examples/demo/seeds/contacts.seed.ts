import { defineSeed } from "@flaredev/core";
import { contacts } from "@/db/schema";

const FIRST = ["Ada", "Grace", "Alan", "Katherine", "Linus", "Margaret", "Dennis", "Barbara", "Ken", "Radia"];
const LAST = ["Lovelace", "Hopper", "Turing", "Johnson", "Torvalds", "Hamilton", "Ritchie", "Liskov", "Thompson", "Perlman"];
const STATUSES = ["lead", "pending", "customer", "churned"] as const;

export default defineSeed(async ({ db, log }) => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 3) % LAST.length]!;
    return {
      name: `${first} ${last}`,
      email: `${first}.${last}.${i}@example.com`.toLowerCase(),
      phone: i % 3 === 0 ? null : `+256 700 ${String(100000 + i * 137).slice(0, 6)}`,
      status: STATUSES[i % STATUSES.length],
      vip: i % 5 === 0,
    };
  });
  // D1 allows at most 100 bound parameters per query, so insert in batches.
  for (let i = 0; i < rows.length; i += 15) await db.insert(contacts).values(rows.slice(i, i + 15));
  log(`inserted ${rows.length} contacts`);
});
