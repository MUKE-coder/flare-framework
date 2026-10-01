import { defineSeed } from "@flaredev/core";

/** Enough rows for CI to page twice and export something. */
export default defineSeed(async ({ db, fake, log }) => {
  for (let index = 0; index < 30; index += 1) {
    await db.contact.create({
      data: {
        name: fake.fullName(),
        email: `contact${index}@example.com`,
        status: fake.pick(["lead", "customer"]),
        updatedAt: new Date(),
      },
    });
  }
  log("seeded 30 contacts");
});
