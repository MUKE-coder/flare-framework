/**
 * Telling "the code in this tab is out of date" apart from a real failure.
 *
 * A browser that has loaded one build and is handed another — you updated the app and
 * it rebuilt, or you started a different Flare app on the same localhost port — can end
 * up executing a module graph that no longer matches what the server is serving. The
 * bundler says so in its own words:
 *
 *   "... was instantiated because it was required from module <file>, but the module
 *    factory is not available."
 *
 * It reads like a crash in your code, and it is not: nothing is wrong with the app, the
 * tab is simply holding stale JavaScript. It matters that the error boundary knows the
 * difference, because the usual remedy — React's `reset()`, which re-renders the
 * segment without a page load — cannot fix this one. The stale modules are still in
 * memory afterwards. Only a real reload replaces them.
 */

/** Phrases every bundler in this family uses for "the code in this tab is out of date". */
const STALE_CHUNK = [
  "module factory is not available",
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
];

/** Whether this error means the tab's JavaScript is stale rather than the app is broken. */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && name.toLowerCase() === "chunkloaderror") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  const haystack = message.toLowerCase();
  return STALE_CHUNK.some((phrase) => haystack.includes(phrase));
}

/**
 * Reload the page, bypassing the cached modules.
 *
 * `location.reload()` is enough for the common case, and is what the bundler's own
 * advice amounts to. It is called from a click handler so the browser treats it as a
 * user-initiated navigation rather than a redirect loop.
 */
export function hardReload(): void {
  if (typeof window !== "undefined") window.location.reload();
}
