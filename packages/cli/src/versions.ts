/**
 * Dependency versions written into scaffolded apps. Pinned to a set verified to
 * build together (vinext is pre-1.0, so ranges are kept tight on purpose).
 */
export const APP_DEPENDENCIES = {
  "@better-auth/drizzle-adapter": "1.7.5",
  "@vinext/cloudflare": "1.0.0-beta.8",
  "better-auth": "1.7.5",
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
  "drizzle-orm": "^0.45.2",
  react: "19.3.0",
  "react-dom": "19.3.0",
  "react-server-dom-webpack": "19.3.0",
  vinext: "1.0.0-beta.10",
} as const;

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
