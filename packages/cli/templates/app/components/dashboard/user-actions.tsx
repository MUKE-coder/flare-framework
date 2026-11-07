"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BanIcon, MoreHorizontalIcon, ShieldIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { createUserAction, setBannedAction, setRoleAction, type UserActionResult } from "@/app/dashboard/users/actions";

/**
 * The management side of the users page: make an account, change a role, ban.
 *
 * Everything here calls the same Better Auth admin API the CLI uses, so an account made
 * from this dialog and one made with `flare user:add` are indistinguishable.
 *
 * The well-known roles get one-click entries; anything else is typed, because a role is
 * just a string your policies name — inventing one here is how you "add a role".
 */
const KNOWN_ROLES = ["admin", "staff", "user"];

export function CreateUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (form: FormData) => {
    startTransition(async () => {
      const result = await createUserAction({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        role: String(form.get("role") ?? "user"),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Account created. They can sign in now.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon data-icon="inline-start" />
          New user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Usable immediately — send them the password and have them change it.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-name">Name</Label>
            <Input id="new-user-name" name="name" required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input id="new-user-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input id="new-user-password" name="password" type="text" required minLength={8} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-role">Role</Label>
            <Input id="new-user-role" name="role" defaultValue="user" list="known-roles" />
            <datalist id="known-roles">
              {KNOWN_ROLES.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">Type anything: a new role exists the moment a policy names it.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowMenu({ userId, role, banned }: { userId: string; role: string; banned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<UserActionResult>, done: string) => {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  };

  const setRole = (next: string) => run(() => setRoleAction({ userId, role: next }), `Role is now ${next}.`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Manage this account" disabled={pending}>
          {pending ? <Spinner /> : <MoreHorizontalIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          <ShieldIcon className="size-3.5" />
          Role
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {KNOWN_ROLES.map((option) => (
            <DropdownMenuItem key={option} disabled={option === role} onSelect={() => setRole(option)}>
              {option}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => {
              const next = window.prompt("Role (lowercase letters, digits, _ or -):", role);
              if (next && next !== role) setRole(next);
            }}
          >
            Something else…
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant={banned ? undefined : "destructive"}
            onSelect={() => run(() => setBannedAction({ userId, banned: !banned }), banned ? "Unbanned — they can sign in again." : "Banned. Their data stays; their way in doesn't.")}
          >
            <BanIcon />
            {banned ? "Unban" : "Ban"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
