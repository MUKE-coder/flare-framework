import type { NextConfig } from "next";

const config: NextConfig = {
  // The generated Prisma client is a real dependency of the server bundle; without this
  // Next tries to trace it as application code and misses the query engine beside it.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"],
};

export default config;
