/**
 * The Workers compatibility date a new app is created with.
 *
 * Deliberately a fixed date rather than today's: workerd only understands dates up to
 * the day its own build was cut, so an app stamped with today refuses to start with
 * "requires compatibility date X, but the newest date supported by this server binary
 * is Y". Bump it when the pinned wrangler version moves, and never past the date that
 * version's runtime supports.
 */
export const COMPATIBILITY_DATE = "2026-09-15";

/**
 * Dependency versions written into scaffolded apps. Pinned to a set verified to
 * build together (vinext is pre-1.0, so ranges are kept tight on purpose).
 */
export const APP_DEPENDENCIES = {
  "@better-auth/drizzle-adapter": "1.7.7",
  "@better-auth/passkey": "1.7.7",
  // Server components import Slot from here rather than the "radix-ui" umbrella (see components/ui/button.tsx).
  "@radix-ui/react-slot": "1.3.3",
  "@vinext/cloudflare": "1.0.0-beta.8",
  "better-auth": "1.7.7",
  // Admin UI (shadcn/ui primitives in components/ui).
  "class-variance-authority": "^0.7.1",
  clsx: "^2.1.1",
  cmdk: "^1.1.1",
  "date-fns": "^4.4.0",
  "lucide-react": "^1.46.0",
  "radix-ui": "^1.6.7",
  "react-day-picker": "^10.0.1",
  sonner: "^2.0.8",
  "tailwind-merge": "^3.7.0",
  "tw-animate-css": "^1.4.0",
  // Typefaces for the six themes (app/globals.css).
  "@fontsource-variable/figtree": "5.3.0",
  "@fontsource-variable/geist": "5.3.0",
  "@fontsource-variable/inter": "5.3.0",
  "@fontsource-variable/noto-sans": "5.3.0",
  "@fontsource-variable/plus-jakarta-sans": "5.3.0",
  // QR codes for authenticator-app (2FA) setup.
  uqr: "0.1.3",
  "drizzle-orm": "^0.45.2",
  react: "19.3.0",
  "react-dom": "19.3.0",
  "react-server-dom-webpack": "19.3.0",
  vinext: "1.0.0-beta.10",
} as const;

/**
 * Better Auth's version, named because `flare gen apikeys` has to add a package pinned to
 * the same one: @better-auth/api-key peer-depends on it exactly.
 */
export const BETTER_AUTH_VERSION = "1.7.7";

/** The API key plugin, added by `flare gen apikeys` rather than shipped with every app. */
export const API_KEY_PACKAGE = "@better-auth/api-key";

export const APP_DEV_DEPENDENCIES = {
  "@cloudflare/vite-plugin": "^1.54.10",
  "@tailwindcss/postcss": "^4.3.3",
  "@types/node": "^22.20.3",
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@vitejs/plugin-react": "^6.1.1",
  "@vitejs/plugin-rsc": "^0.5.35",
  "drizzle-kit": "^0.31.10",
  tailwindcss: "^4.3.3",
  typescript: "^7.0.2",
  vite: "^8.3.0",
  wrangler: "^4.132.0",
} as const;

/**
 * Dependencies a Next.js-stack app gets instead of the Cloudflare ones.
 *
 * Pinned the same way and for the same reason: a set verified to work together beats a
 * range that resolves to something nobody has run.
 */
export const NEXT_DEPENDENCIES = {
  // 16.0.4 was carrying 36 advisories, three of them critical: unauthenticated RCE in the
  // image optimizer and on Windows hosts (both fixed in 16.3.3), and RCE in the flight
  // protocol. Vercel refuses to build it. A pin is only worth having if it is moved when
  // one of these lands, so treat a critical against this line as a release of its own.
  next: "16.3.8",
  "@prisma/client": "7.10.0",
  "@prisma/adapter-pg": "7.10.0",
  pg: "^8.16.3",
  "@upstash/redis": "^1.36.0",
  "@better-auth/prisma-adapter": "1.7.7",
  // Signs S3 requests in a few kilobytes, where the AWS SDK is megabytes.
  aws4fetch: "^1.0.20",
  dotenv: "^17.2.3",
} as const;

export const NEXT_DEV_DEPENDENCIES = {
  prisma: "7.10.0",
  // Runs seeds: the generated Prisma client is TypeScript a bundler compiles.
  tsx: "^4.23.13",
  // `flare deploy` and `npm run deploy`. Local rather than global, so the deploy works
  // on a fresh clone and every app pins its own version.
  vercel: "^60.1.3",
  "@types/node": "^22.20.3",
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@tailwindcss/postcss": "^4.3.3",
  tailwindcss: "^4.3.3",
  typescript: "~5.9.3",
} as const;

/** Cloudflare-only files a Next.js app has no use for. */
export const CLOUDFLARE_ONLY = [
  "wrangler.jsonc",
  "vite.config.ts",
  "worker",
  "db",
  "migrations",
  "drizzle.config.ts",
  ".dev.vars.example",
  "worker-configuration.d.ts",
  // The engine's Drizzle adapter; the Next.js overlay brings prisma-rows.ts instead.
  "lib/resource/drizzle-rows.ts",
] as const;
