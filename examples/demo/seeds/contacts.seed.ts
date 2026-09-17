import { defineSeed } from "@flare/core";
import { contacts } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  const rows = [1, 2, 3].map((i) => ({
    name: `Name ${i}`,
    email: `user${i}@example.com`,
  }));
  await db.insert(contacts).values(rows);
  log(`inserted ${rows.length} contacts`);
});
