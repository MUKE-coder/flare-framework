import { PackageIcon } from "lucide-react";
import { storage } from "@/lib/storage";

/**
 * A product's picture, from its object key.
 *
 * The bucket is private, so the page signs a read URL as it renders. An hour is plenty
 * for a page someone is looking at, and a link copied out of the markup stops working
 * long before it could be passed around.
 */
export async function ProductImage({ objectKey, alt, className }: { objectKey: string | null; alt: string; className?: string }) {
  const src = objectKey ? await storage.createReadUrl({ key: objectKey, expiresIn: 3600 }).catch(() => null) : null;

  return (
    <div className={className ?? "grid aspect-[4/3] w-full place-items-center overflow-hidden bg-muted"}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <PackageIcon className="size-8 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
