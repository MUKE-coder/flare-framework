import type { NextConfig } from "next";

const config: NextConfig = {
  // The generated Prisma client is a real dependency of the server bundle; without this
  // Next tries to trace it as application code and misses the query engine beside it.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  // Compile @flaredev/core from source rather than resolving it as an opaque package.
  // Needed when it is linked from a checkout or a monorepo: the bundler won't follow a
  // symlink out of the project root, and every import from it fails to resolve.
  transpilePackages: ["@flaredev/core"],
};

export default config;
