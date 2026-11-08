import { CheckCircle2Icon, MinusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "./local-time";
import { UserAvatar } from "./user-menu";
import { UserRowMenu } from "./user-actions";

/**
 * The accounts table, shared by both stacks: the page above it only decides where the
 * rows come from (Prisma on Next.js, Drizzle on Cloudflare).
 */
export interface AccountRow {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  /** The admin plugin's default role is "user"; null means the same. */
  role?: string | null;
  banned?: boolean | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean | null;
  createdAt: Date;
}

/** Roles that stand out: everything else is the ordinary "user" and stays quiet. */
function roleTone(role: string): "default" | "secondary" {
  return role === "admin" ? "default" : "secondary";
}

export function UsersTable({
  rows,
  total,
  currentUserId,
  roles,
  manage = false,
}: {
  rows: AccountRow[];
  total: number;
  currentUserId: string;
  /** Every role this app knows, for the row menu's picker. */
  roles: { name: string; label: string }[];
  /** Whether this person may change a role or ban somebody. */
  manage?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accounts</CardTitle>
        <CardDescription>
          {total.toLocaleString()} {total === 1 ? "account" : "accounts"}
          {total > rows.length ? `, newest ${rows.length} shown` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Who</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Two-factor</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="w-10" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar user={account} className="size-8 rounded-md" />
                      <div className="grid min-w-0 leading-tight">
                        <span className="truncate text-sm font-medium">{account.name || "—"}</span>
                        <span className="truncate text-xs text-muted-foreground">{account.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.banned ? (
                      <Badge variant="destructive">banned</Badge>
                    ) : (
                      <Badge variant={roleTone(account.role ?? "user")}>{account.role ?? "user"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {account.emailVerified ? (
                      <CheckCircle2Icon aria-label="Email verified" className="size-4.5 text-success" />
                    ) : (
                      <MinusIcon aria-label="Not verified" className="size-4.5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {account.twoFactorEnabled ? (
                      <CheckCircle2Icon aria-label="Two-factor on" className="size-4.5 text-success" />
                    ) : (
                      <MinusIcon aria-label="Two-factor off" className="size-4.5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                    <LocalTime value={account.createdAt} />
                  </TableCell>
                  <TableCell>
                    {/* Not on your own row: demoting or banning yourself is a lockout, not a feature. */}
                    {manage && account.id !== currentUserId && (
                      <UserRowMenu userId={account.id} role={account.role ?? "user"} banned={Boolean(account.banned)} roles={roles} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          A role is a name your <a className="underline underline-offset-2" href="https://flare-docs.codetotech.com/guides/roles-and-policies/" target="_blank" rel="noreferrer">policies</a> give
          meaning: <code>npx flare gen policy Contact --roles admin,staff</code> decides what each role may do. The terminal does all
          of this too — <code>npx flare user:add</code>, <code>npx flare user:role</code> — and writes the same rows.
        </p>
      </CardContent>
    </Card>
  );
}
