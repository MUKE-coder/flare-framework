import { defineSeed } from "@flaredev/core";
import { companies, deals } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  const [company] = await db.select().from(companies).limit(1);
  const rows = [1, 2, 3].map((i) => ({
    title: `Title ${i}`,
    amount: i * 1.5,
    companyId: company.id,
  }));
  await db.insert(deals).values(rows);
  log(`inserted ${rows.length} deals for ${company.name}`);
});
