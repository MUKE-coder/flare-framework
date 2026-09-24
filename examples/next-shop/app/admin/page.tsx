import { permanentRedirect } from "next/navigation";

/**
 * The admin used to live here. It's the dashboard now — one signed-in area, with the
 * resources, the account pages, security and observability in the same shell.
 *
 * Kept so links and bookmarks still land somewhere.
 */
export default function AdminPage() {
  permanentRedirect("/dashboard");
}
