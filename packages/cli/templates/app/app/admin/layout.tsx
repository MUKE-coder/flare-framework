import { Toaster } from "@/components/ui/sonner";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      {children}
      <Toaster />
    </div>
  );
}
