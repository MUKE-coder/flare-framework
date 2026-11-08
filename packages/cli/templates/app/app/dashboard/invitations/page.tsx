import { MailIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { LocalTime } from "@/components/dashboard/local-time";
import { InviteForm } from "@/components/dashboard/invite-form";
import { authConfig } from "@/lib/auth-config";
import { canArea, requireArea } from "@/lib/dashboard";
import { listInvitations } from "@/lib/invitations";
import { cancelInvitation, issueInvitation } from "./actions";

export const metadata = { title: "Invitations" };

/**
 * Who has been invited, and a form to invite somebody.
 *
 * Only useful when `authConfig.signup` is `invite`, so the page says so rather than
 * quietly issuing links that nothing checks — an invitation that is not required is a
 * link that looks like a gate and is not one.
 */
export default async function InvitationsPage() {
  await requireArea("@dashboard-invitations");
  const [mayInvite, mayRevoke] = await Promise.all([
    canArea("@dashboard-invitations", "create"),
    canArea("@dashboard-invitations", "delete"),
  ]);
  const invitations = authConfig.signup === "invite" ? await listInvitations() : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Invitations" description="Links that let somebody create an account." />

      {authConfig.signup !== "invite" && (
        <Alert>
          <AlertTitle>Sign-up is {authConfig.signup}</AlertTitle>
          <AlertDescription>
            {authConfig.signup === "open"
              ? "Anybody can create an account, so an invitation is not needed. Set signup to \"invite\" in lib/auth-config.ts to require one."
              : "Nobody can create an account. Make them with `flare user:add <email>`, or set signup to \"invite\" in lib/auth-config.ts to use links instead."}
          </AlertDescription>
        </Alert>
      )}

      {authConfig.signup === "invite" && !mayInvite && (
        <Alert>
          <AlertTitle>Admins only</AlertTitle>
          <AlertDescription>Your role cannot issue invitations.</AlertDescription>
        </Alert>
      )}

      {authConfig.signup === "invite" && mayInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite somebody</CardTitle>
            <CardDescription>
              Leave the address empty for a link anybody may use. The link is shown once — it is not stored, so there is no way to read it again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm issue={issueInvitation} />
          </CardContent>
        </Card>
      )}

      {authConfig.signup === "invite" && (
        <Card>
          <CardHeader>
            <CardTitle>Outstanding</CardTitle>
            <CardDescription>Invitations that have not been used and have not expired.</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <MailIcon />
                  <EmptyTitle>Nothing outstanding</EmptyTitle>
                  <EmptyDescription>An invitation disappears from here once it is used.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email ?? <Badge variant="secondary">anybody with the link</Badge>}</TableCell>
                      <TableCell>
                        <LocalTime value={invitation.createdAt.toISOString()} />
                      </TableCell>
                      <TableCell>
                        <LocalTime value={invitation.expiresAt.toISOString()} />
                      </TableCell>
                      <TableCell>
                        {mayRevoke && (
                          <form action={cancelInvitation.bind(null, invitation.id)}>
                            <button type="submit" className="text-sm text-destructive underline-offset-4 hover:underline">
                              Revoke
                            </button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
