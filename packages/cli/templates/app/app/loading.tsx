import { Skeleton } from "@/components/ui/skeleton";

/**
 * The public shell while a page loads.
 *
 * Deliberately vague — it stands in for any public page, and guessing a layout it
 * can't know would move things around once the real one arrives. Pages with a shape
 * worth matching have their own `loading.tsx` beside them.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-24">
      <Skeleton className="h-10 w-3/4 max-w-xl" />
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <Skeleton className="mt-2 h-5 w-full max-w-md" />
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-12 w-36 rounded-[var(--button-radius)]" />
        <Skeleton className="h-12 w-32 rounded-[var(--button-radius)]" />
      </div>
    </main>
  );
}
