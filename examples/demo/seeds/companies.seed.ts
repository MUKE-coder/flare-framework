import { defineSeed } from "@flare/core";
import { companies } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  const rows = [1, 2, 3].map((i) => ({
    name: `Name ${i}`,
  }));
  await db.insert(companies).values(rows);
  log(`inserted ${rows.length} companies`);
});
