import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, UserCog, UserPlus } from "lucide-react";
import { del, get, patch, post } from "../api";
import { formatDate, useAction, useSession } from "../lib";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  Toggle,
} from "../components/ui";

export default function ConsoleAdminsPage() {
  const me = useSession();
  const [editing, setEditing] = useState(null); // {} for new
  const [deleting, setDeleting] = useState(null);
  const admins = useQuery({ queryKey: ["admins"], queryFn: () => get("/console/admins/") });
  const remove = useAction((admin) => del(`/console/admins/${admin.id}/`), {
    invalidate: ["admins", "audit"],
    success: (_, admin) => `Deleted ${admin.username}.`,
    onSuccess: () => setDeleting(null),
  });

  return (
    <>
      <PageHeader
        title="Console administrators"
        description="Who can sign in to this console. AD accounts get their access from identity domain groups at each sign-in; local accounts are for emergencies."
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setEditing({})}>
            New local account
          </Button>
        }
      />
      <Card>
        {admins.isPending ? (
          <Spinner />
        ) : admins.isError ? (
          <ErrorState error={admins.error} onRetry={admins.refetch} />
        ) : admins.data.length === 0 ? (
          <EmptyState icon={UserCog} title="No administrators" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {admins.data.map((admin) => {
              const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.username;
              const isMe = admin.username === me.username;
              return (
                <li key={admin.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-slate-900 dark:text-white">{name}</span>
                      {isMe && <Badge>You</Badge>}
                      {admin.isSuperuser && <Badge tone="brand">Superuser</Badge>}
                      <Badge tone={admin.signInMethod === "ad" ? "green" : "amber"}>
                        {admin.signInMethod === "ad" ? "AD sign-in" : "Local password"}
                      </Badge>
                      {!admin.isActive && <StatusBadge active={false} />}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {admin.username}
                      {admin.email && ` · ${admin.email}`} · last sign-in{" "}
                      {admin.lastLogin ? formatDate(admin.lastLogin, { time: true }) : "never"}
                    </div>
                  </div>
                  <IconButton icon={Pencil} label={`Edit ${admin.username}`} onClick={() => setEditing(admin)} />
                  {!isMe && (
                    <IconButton icon={Trash2} label={`Delete ${admin.username}`} onClick={() => setDeleting(admin)}
                      className="hover:text-rose-600 dark:hover:text-rose-400" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <AdminModal admin={editing} isMe={editing.username === me.username} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        pending={remove.isPending}
        title={`Delete ${deleting?.username}?`}
        confirmLabel="Delete"
      >
        They can no longer sign in to the console or the Django admin. Their past actions stay in the audit log.
      </ConfirmDialog>
    </>
  );
}

function AdminModal({ admin, isMe, onClose }) {
  const isNew = !admin.id;
  const isAD = admin.signInMethod === "ad";
  const [form, setForm] = useState({
    username: admin.username ?? "",
    firstName: admin.firstName ?? "",
    lastName: admin.lastName ?? "",
    email: admin.email ?? "",
    isSuperuser: admin.isSuperuser ?? false,
    isActive: admin.isActive ?? true,
    password: "",
  });
  const save = useAction(
    () => {
      const body = { ...form };
      if (!body.password) delete body.password;
      return isNew ? post("/console/admins/", body) : patch(`/console/admins/${admin.id}/`, body);
    },
    {
      invalidate: ["admins", "audit"],
      success: (data) => (isNew ? `Created ${data.username}.` : `Saved ${data.username}.`),
      onSuccess: onClose,
    }
  );
  const errors = save.error?.fields ?? {};
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "New local administrator" : `Edit ${admin.username}`}
      description={isNew ? "For emergencies only. Staff normally get access through the identity domain groups and sign in with AD." : undefined}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {isNew ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <Input label="Username" value={form.username} onChange={set("username")} error={errors.username}
        autoCapitalize="none" autoComplete="off" required autoFocus={isNew} hint="Not case-sensitive when signing in." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="First name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
        <Input label="Last name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
      </div>
      <Input label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} />
      {isAD ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Signs in with AD. Their password is managed in AD, and their superuser status is reset from the
          identity domain groups each time they sign in. To remove access now, switch off <em>Can sign in</em>.
        </p>
      ) : (
        <Input
          label={isNew ? "Password" : "New password"}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          hint={isNew ? "At least 8 characters, not a common password." : "Leave empty to keep the current password."}
        />
      )}
      <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
        <Toggle checked={form.isSuperuser} onChange={(isSuperuser) => setForm({ ...form, isSuperuser })}
          label="Superuser" description="Can manage console administrators and everything in the Django admin." />
        <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })}
          label="Can sign in" description="Switch off to suspend the account without deleting it." />
        {isMe && <p className="text-xs text-slate-500 dark:text-slate-400">You can't remove your own superuser access or suspend yourself.</p>}
      </div>
    </Modal>
  );
}
