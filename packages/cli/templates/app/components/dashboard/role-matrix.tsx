"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LockIcon, PlusIcon, ShieldIcon, Trash2Icon, UnlockIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createRoleAction, deleteRoleAction, setGrantAction } from "@/app/dashboard/roles/actions";

export interface MatrixResource {
  name: string;
  pluralLabel: string;
  /** Whether a policy file restricts it. Without one, every signed-in user may use it. */
  restricted: boolean;
  /** Roles the policy *file* gives, per action — these are ticked and locked. */
  fromCode: Record<string, string[]>;
  /** Roles the dashboard has granted, per action — these are the editable ticks. */
  granted: Record<string, string[]>;
}

/** One of the dashboard's own pages. See lib/areas.ts for where these come from. */
export interface MatrixArea {
  id: string;
  label: string;
  blurb: string;
  /** The actions that mean something here; the rest of the row is blank. */
  actions: string[];
  /** Actions another layer owns, and why — shown locked, whoever the role is. */
  locked: Record<string, string>;
  caution?: string;
  fromCode: Record<string, string[]>;
  granted: Record<string, string[]>;
}

export interface MatrixRole {
  name: string;
  label: string;
}

const ACTIONS = ["read", "create", "update", "delete"] as const;

/**
 * Who may do what, as a grid.
 *
 * Two kinds of tick, and the difference is the point. A **locked** tick comes from
 * `policies/<resource>.policy.ts` and cannot be changed here — the file is the floor,
 * and a screen that appeared to remove access the code grants would be lying. An
 * **open** tick is a grant in the database, and is yours to set.
 *
 * A resource with no policy file is open to every signed-in user. Ticking boxes on it
 * would change nothing, so the row says so and points at the command that restricts it,
 * rather than offering controls that quietly do nothing.
 *
 * The second grid is the dashboard's own pages — Users, this screen, Observability, and
 * whatever is under Platform. They behave identically, with ADMIN_ROLES as the floor
 * instead of a policy file, so one mental model covers both.
 */
export function RoleMatrix({
  roles,
  resources,
  areas,
  adminRoles,
}: {
  roles: MatrixRole[];
  resources: MatrixResource[];
  areas: MatrixArea[];
  adminRoles: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(roles[0]?.name ?? "");
  const [open, setOpen] = useState(false);

  const role = roles.find((candidate) => candidate.name === selected);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });

  const addRole = (form: FormData) => {
    const name = String(form.get("name") ?? "");
    run(async () => {
      const result = await createRoleAction({ name, label: String(form.get("label") ?? "") });
      if (result.ok) {
        setSelected(name.trim().toLowerCase());
        setOpen(false);
      }
      return result;
    }, "Role created.");
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <CardDescription>
            A role is a name your policies give meaning. Assign one to somebody from{" "}
            <a href="/dashboard/users" className="underline underline-offset-2">
              Users
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {roles.map((candidate) => (
            <Button
              key={candidate.name}
              variant={candidate.name === selected ? "default" : "outline"}
              size="sm"
              onClick={() => setSelected(candidate.name)}
            >
              <ShieldIcon data-icon="inline-start" />
              {candidate.label}
            </Button>
          ))}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" />
                New role
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>New role</DialogTitle>
                <DialogDescription>It exists as soon as you name it; what it may do is the grid below.</DialogDescription>
              </DialogHeader>
              <form action={addRole} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="role-name">Name</Label>
                  <Input id="role-name" name="name" placeholder="support-agent" required autoComplete="off" />
                  <p className="text-xs text-muted-foreground">Lowercase letters, digits, _ or -. This is what `user.role` holds.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="role-label">Label</Label>
                  <Input id="role-label" name="label" placeholder="Support agent" autoComplete="off" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={pending}>
                    {pending && <Spinner data-icon="inline-start" />}
                    Create role
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {role && !adminRoles.includes(role.name) && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await deleteRoleAction(role.name);
                  if (result.ok) setSelected(roles.find((other) => other.name !== role.name)?.name ?? "");
                  return result;
                }, `Deleted ${role.label}.`)
              }
            >
              <Trash2Icon data-icon="inline-start" />
              Delete {role.label}
            </Button>
          )}
        </CardContent>
      </Card>

      {role && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What {role.label} may do with your data</CardTitle>
            <CardDescription>
              A locked tick comes from the resource&apos;s policy file and can only be changed there. Everything else is yours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    {ACTIONS.map((action) => (
                      <TableHead key={action} className="w-24 text-center capitalize">
                        {action}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map((resource) => (
                    <TableRow key={resource.name}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{resource.pluralLabel}</span>
                          {!resource.restricted && (
                            <span className="text-xs text-muted-foreground">
                              Open to everyone signed in — <code>flare gen policy {resource.name} --roles admin</code> to restrict it.
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {ACTIONS.map((action) => {
                        const inCode = (resource.fromCode[action] ?? []).some((named) => named === role.name || named === "*");
                        const isGranted = (resource.granted[action] ?? []).includes(role.name);
                        if (!resource.restricted) {
                          return (
                            <TableCell key={action} className="text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex text-muted-foreground">
                                    <UnlockIcon className="size-4" aria-label="No policy: everyone signed in may do this" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>This resource has no policy, so every signed-in user may do this.</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        }
                        if (inCode) {
                          return (
                            <TableCell key={action} className="text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex text-success">
                                    <LockIcon className="size-4" aria-label="Granted by the policy file" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  policies/{resource.name.toLowerCase()}.policy.ts grants this. Change it there.
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={action} className="text-center">
                            <Checkbox
                              checked={isGranted}
                              disabled={pending}
                              aria-label={`${role.label} may ${action} ${resource.pluralLabel.toLowerCase()}`}
                              onCheckedChange={(next) =>
                                run(() =>
                                  setGrantAction({ role: role.name, resource: resource.name, action, granted: next === true }),
                                )
                              }
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <LockIcon className="size-3.5 text-success" /> from the policy file
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UnlockIcon className="size-3.5" /> no policy — open to everyone signed in
              </span>
              <Badge variant="secondary">Grants widen a policy; they never narrow one.</Badge>
            </p>
          </CardContent>
        </Card>
      )}

      {role && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">…and in the dashboard itself</CardTitle>
            <CardDescription>
              The pages that are not resources. {adminRoles.join(" and ")} always reach all of them — that is the floor, and it is why
              those ticks are locked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    {ACTIONS.map((action) => (
                      <TableHead key={action} className="w-24 text-center capitalize">
                        {action}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areas.map((area) => (
                    <TableRow key={area.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{area.label}</span>
                          <span className="text-xs text-muted-foreground">{area.blurb}</span>
                          {area.caution && <span className="mt-0.5 text-xs text-warning">{area.caution}</span>}
                        </div>
                      </TableCell>
                      {ACTIONS.map((action) => {
                        // An action this page doesn't have: nothing to say, so nothing is
                        // shown. A disabled checkbox there would read as "not yet".
                        if (!area.actions.includes(action)) {
                          return (
                            <TableCell key={action} className="text-center text-muted-foreground/40">
                              —
                            </TableCell>
                          );
                        }
                        const owner = area.locked[action];
                        const inFloor = (area.fromCode[action] ?? []).includes(role.name);
                        if (owner || inFloor) {
                          return (
                            <TableCell key={action} className="text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex ${inFloor ? "text-success" : "text-muted-foreground"}`}>
                                    <LockIcon className="size-4" aria-label={inFloor ? "Always allowed" : "Decided elsewhere"} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {inFloor ? `${role.label} always has this: ADMIN_ROLES in lib/dashboard.ts.` : owner}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={action} className="text-center">
                            <Checkbox
                              checked={(area.granted[action] ?? []).includes(role.name)}
                              disabled={pending}
                              aria-label={`${role.label} may ${action} ${area.label.toLowerCase()}`}
                              onCheckedChange={(next) =>
                                run(() => setGrantAction({ role: role.name, resource: area.id, action, granted: next === true }))
                              }
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <LockIcon className="size-3.5 text-success" /> always allowed — ADMIN_ROLES
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LockIcon className="size-3.5" /> owned by another layer; the tooltip says which
              </span>
              <span>— this page has no such action</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
