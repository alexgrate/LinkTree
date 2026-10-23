import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldAlert, ShieldCheck, User, UsersRound, X } from "lucide-react";
import { del, get, post } from "../api";
import { useAction } from "../lib";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, PageHeader, Spinner } from "../components/ui";
import GranteePicker from "../components/GranteePicker";

const HIGH_PRIVILEGE = ["Identity Domain Administrator", "Security Administrator"];

export default function AdminRolesPage() {
  const [assigning, setAssigning] = useState(null);
  const [revoking, setRevoking] = useState(null); // { role, holder }

  const roles = useQuery({ queryKey: ["admin-roles"], queryFn: () => get("/console/admin-roles/") });

  const grant = useAction(
    ({ role, grantee }) => post(`/console/admin-roles/${role.id}/grants/`, { type: grantee.type, id: grantee.id }),
    {
      invalidate: ["admin-roles", "overview", "audit"],
      success: (data, { role }) => `${data.display} is now ${role.displayName}.`,
    }
  );
  const revoke = useAction(({ role, holder }) => del(`/console/admin-roles/${role.id}/grants/${holder.grantId}/`), {
    invalidate: ["admin-roles", "overview", "audit"],
    success: (_, { role, holder }) => `Removed ${role.displayName} from ${holder.display}.`,
    onSuccess: () => setRevoking(null),
  });

  // Keep the picker's role in sync with refreshed data so "Added" ticks update.
  const pickerRole = assigning && roles.data?.find((r) => r.id === assigning.id);

  return (
    <>
      <PageHeader
        title="Administrator roles"
        description="Who can administer the OCI identity domain. Prefer assigning roles to groups, and keep the most powerful roles to a few people."
      />

      {roles.isPending ? (
        <Spinner />
      ) : roles.isError ? (
        <Card>
          <ErrorState error={roles.error} onRetry={roles.refetch} />
        </Card>
      ) : roles.data.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="No administrator roles found" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.data.map((role) => {
            const high = HIGH_PRIVILEGE.includes(role.displayName);
            return (
              <Card key={role.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      high
                        ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                        : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    }`}
                  >
                    {high ? <ShieldAlert className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-white">{role.displayName}</h2>
                      {high && <Badge tone="red">High privilege</Badge>}
                    </div>
                    {role.description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{role.description}</p>}
                  </div>
                  <Button size="sm" icon={Plus} onClick={() => setAssigning(role)}>
                    Assign
                  </Button>
                </div>
                {role.holders.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">Nobody has this role.</p>
                ) : (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {role.holders.map((holder) => {
                      const Icon = holder.type === "Group" ? UsersRound : User;
                      return (
                        <li
                          key={holder.grantId}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Icon className="size-3.5 text-slate-400" aria-label={holder.type} />
                          {holder.display}
                          <IconButton
                            icon={X}
                            label={`Remove ${role.displayName} from ${holder.display}`}
                            className="p-1"
                            onClick={() => setRevoking({ role, holder })}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <GranteePicker
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title={`Assign ${assigning?.displayName ?? ""}`}
        description="The role applies as soon as you add someone. Every change is recorded in the audit log."
        assigned={new Set((pickerRole?.holders ?? []).map((h) => `${h.type}:${h.id}`))}
        onPick={(grantee) => grant.mutateAsync({ role: assigning, grantee })}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoke.mutate(revoking)}
        pending={revoke.isPending}
        title={`Remove ${revoking?.role.displayName}?`}
        confirmLabel="Remove role"
      >
        {revoking?.holder.display} will lose these administrator permissions immediately.
        {revoking?.holder.type === "Group" && " This applies to every member of the group."}
      </ConfirmDialog>
    </>
  );
}
