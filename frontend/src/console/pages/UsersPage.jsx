import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  KeyRound,
  Mail,
  Plus,
  Power,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { del, get, patch, post } from "../api";
import { cx, formatDate, useAction, useDebounced } from "../lib";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SecretDialog,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
} from "../components/ui";
import GranteePicker from "../components/GranteePicker";

const PAGE_SIZE = 25;
const STATUSES = [
  { id: "", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("user");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [start, setStart] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(query.trim());

  const users = useQuery({
    queryKey: ["users", q, status, start],
    queryFn: () => get("/console/users/", { q, status, start, count: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  function select(id) {
    setParams(id ? { user: id } : {});
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="People in the OCI identity domain, including accounts synced from Active Directory."
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>
            New user
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setStart(1);
            }}
            placeholder="Search by name, username or email"
            className="min-w-56 flex-1"
          />
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={status === s.id}
                onClick={() => {
                  setStatus(s.id);
                  setStart(1);
                }}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  status === s.id
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {users.isPending ? (
          <Spinner />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={users.refetch} />
        ) : users.data.items.length === 0 ? (
          <EmptyState icon={Users} title="No users found">
            {q ? `Nothing matches “${q}”.` : "Add the first user, or connect Active Directory sync in OCI."}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase dark:text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Email</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Title</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.data.items.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => select(user.id)}
                      className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            select(user.id);
                          }}
                          className="flex items-center gap-3 text-left focus-visible:outline-none"
                        >
                          <Avatar name={user.displayName} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900 dark:text-white">
                              {user.displayName}
                            </span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {user.userName}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell dark:text-slate-300">{user.email}</td>
                      <td className="hidden px-4 py-3 text-slate-600 lg:table-cell dark:text-slate-300">
                        {user.title || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge active={user.active} />
                          {user.federated && <Badge tone="brand">Federated</Badge>}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">
                        {formatDate(user.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination start={start} count={PAGE_SIZE} total={users.data.total} onChange={setStart} />
          </>
        )}
      </Card>

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={(user) => select(user.id)} />
      <UserDrawer userId={selected} onClose={() => select(null)} />
    </>
  );
}

// ---- Create ---------------------------------------------------------------------

const EMPTY_USER = { givenName: "", familyName: "", userName: "", email: "", title: "" };

function CreateUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_USER);
  const [userNameEdited, setUserNameEdited] = useState(false);
  const create = useAction((data) => post("/console/users/", data), {
    invalidate: ["users", "overview"],
    success: (user) => `Created ${user.displayName}.`,
    onSuccess: (user) => {
      close();
      onCreated(user);
    },
  });
  const errors = create.error?.fields ?? {};

  function close() {
    setForm(EMPTY_USER);
    setUserNameEdited(false);
    create.reset();
    onClose();
  }

  // Suggest firstname.lastname as the username until the admin types their own.
  function update(field, value) {
    const next = { ...form, [field]: value };
    if (!userNameEdited && (field === "givenName" || field === "familyName")) {
      next.userName = [next.givenName, next.familyName]
        .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""))
        .filter(Boolean)
        .join(".");
    }
    setForm(next);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New user"
      description="Creates the account in the OCI identity domain. OCI emails the user an activation link."
      onSubmit={() => create.mutate(form)}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create user
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="First name" value={form.givenName} error={errors.givenName} autoFocus
          onChange={(e) => update("givenName", e.target.value)} />
        <Input label="Last name" value={form.familyName} error={errors.familyName} required
          onChange={(e) => update("familyName", e.target.value)} />
      </div>
      <Input label="Work email" type="email" value={form.email} error={errors.email} required
        onChange={(e) => update("email", e.target.value)} />
      <Input
        label="Username"
        value={form.userName}
        error={errors.userName}
        hint="Used to sign in. Usually firstname.lastname or the email address."
        autoCapitalize="none"
        required
        onChange={(e) => {
          setUserNameEdited(true);
          update("userName", e.target.value);
        }}
      />
      <Input label="Job title" value={form.title} error={errors.title} onChange={(e) => update("title", e.target.value)} />
    </Modal>
  );
}

// ---- Detail drawer ------------------------------------------------------------------

function UserDrawer({ userId, onClose }) {
  const [tab, setTab] = useState("profile");
  const [confirm, setConfirm] = useState(null); // "delete" | "status"
  const [resetting, setResetting] = useState(false);

  const user = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: () => get(`/console/users/${userId}/`),
    enabled: Boolean(userId),
  });
  const u = user.data;

  const setActive = useAction((active) => post(`/console/users/${userId}/${active ? "activate" : "deactivate"}/`), {
    invalidate: ["users", "overview", "audit"],
    success: (data) => `${data.displayName} is now ${data.active ? "active" : "inactive"}.`,
    onSuccess: () => setConfirm(null),
  });
  const remove = useAction(() => del(`/console/users/${userId}/`), {
    invalidate: ["users", "groups", "admin-roles", "overview", "audit"],
    success: () => `Deleted ${u.displayName}.`,
    onSuccess: () => {
      setConfirm(null);
      onClose();
    },
  });

  function close() {
    setTab("profile");
    onClose();
  }

  return (
    <Drawer
      open={Boolean(userId)}
      onClose={close}
      title={
        u ? (
          <div className="flex items-center gap-3">
            <Avatar name={u.displayName} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{u.displayName}</h2>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{u.userName}</p>
            </div>
          </div>
        ) : (
          <h2 className="text-lg font-semibold">User</h2>
        )
      }
      subtitle={
        u && (
          <div className="flex gap-1">
            <StatusBadge active={u.active} />
            {u.federated && <Badge tone="brand">Federated</Badge>}
          </div>
        )
      }
      actions={
        u && (
          <>
            <Button size="sm" icon={RotateCcw} onClick={() => setResetting(true)}>
              Reset password
            </Button>
            <Button size="sm" icon={Power} onClick={() => setConfirm("status")}>
              {u.active ? "Deactivate" : "Activate"}
            </Button>
            <IconButton icon={Trash2} label="Delete user" onClick={() => setConfirm("delete")}
              className="hover:text-rose-600 dark:hover:text-rose-400" />
          </>
        )
      }
    >
      {user.isPending ? (
        <Spinner />
      ) : user.isError ? (
        <ErrorState error={user.error} onRetry={user.refetch} />
      ) : (
        <div className="space-y-5">
          <Tabs
            tabs={[
              { id: "profile", label: "Profile" },
              { id: "groups", label: "Groups", count: u.groups?.length ?? 0 },
              { id: "credentials", label: "Credentials" },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === "profile" && <ProfileTab key={u.id} user={u} />}
          {tab === "groups" && <UserGroupsTab user={u} />}
          {tab === "credentials" && <CredentialsTab user={u} />}
        </div>
      )}

      {u && (
        <>
          <ConfirmDialog
            open={confirm === "status"}
            onClose={() => setConfirm(null)}
            onConfirm={() => setActive.mutate(!u.active)}
            pending={setActive.isPending}
            tone={u.active ? "danger" : "primary"}
            title={u.active ? `Deactivate ${u.displayName}?` : `Activate ${u.displayName}?`}
            confirmLabel={u.active ? "Deactivate" : "Activate"}
          >
            {u.active
              ? "They're signed out of every application that uses this identity domain and can't sign in again until reactivated. Their groups, roles and credentials are kept."
              : "They'll be able to sign in again with their existing password."}
          </ConfirmDialog>
          <ConfirmDialog
            open={confirm === "delete"}
            onClose={() => setConfirm(null)}
            onConfirm={() => remove.mutate()}
            pending={remove.isPending}
            title={`Delete ${u.displayName}?`}
            confirmLabel="Delete permanently"
          >
            This removes the account, its group memberships, admin roles and credentials from OCI. It can't be undone.
            {u.federated && " This user is synced from Active Directory and may be recreated by the next sync; disable them in AD instead."}
            <p className="mt-2">For someone leaving, deactivating is usually the safer choice.</p>
          </ConfirmDialog>
          <ResetPasswordModal open={resetting} onClose={() => setResetting(false)} user={u} />
        </>
      )}
    </Drawer>
  );
}

function ProfileTab({ user }) {
  const [form, setForm] = useState({
    givenName: user.givenName,
    familyName: user.familyName,
    email: user.email,
    title: user.title,
  });
  const save = useAction((data) => patch(`/console/users/${user.id}/`, data), {
    invalidate: ["users"],
    success: "Profile saved.",
  });
  const errors = save.error?.fields ?? {};
  const changed = Object.entries(form).some(([key, value]) => value !== user[key]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(form);
      }}
    >
      {user.federated && (
        <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          This user is managed by Active Directory. Changes made here may be overwritten by the next sync.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="First name" value={form.givenName} error={errors.givenName}
          onChange={(e) => setForm({ ...form, givenName: e.target.value })} />
        <Input label="Last name" value={form.familyName} error={errors.familyName}
          onChange={(e) => setForm({ ...form, familyName: e.target.value })} />
      </div>
      <Input label="Work email" type="email" value={form.email} error={errors.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label="Job title" value={form.title} error={errors.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Created</dt>
          <dd>{formatDate(user.createdAt, { time: true })}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Last changed</dt>
          <dd>{formatDate(user.updatedAt, { time: true })}</dd>
        </div>
      </dl>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!changed} loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function UserGroupsTab({ user }) {
  const [picking, setPicking] = useState(false);
  const add = useAction(({ id }) => post(`/console/groups/${id}/members/`, { userIds: [user.id] }), {
    invalidate: ["users", "groups"],
    success: (group) => `Added to ${group.displayName}.`,
  });
  const remove = useAction((group) => del(`/console/groups/${group.id}/members/${user.id}/`), {
    invalidate: ["users", "groups"],
    success: (_, group) => `Removed from ${group.displayName}.`,
  });
  const groups = user.groups ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => setPicking(true)}>
          Add to group
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={UsersRound} title="Not in any groups">
          Groups give access to applications and admin roles.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {groups.map((group) => (
            <li key={group.id} className="flex items-center gap-3 px-4 py-2.5">
              <UsersRound className="size-4 text-slate-400" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium">{group.displayName}</span>
              <IconButton
                icon={X}
                label={`Remove from ${group.displayName}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(group)}
              />
            </li>
          ))}
        </ul>
      )}
      <GranteePicker
        open={picking}
        onClose={() => setPicking(false)}
        title={`Add ${user.displayName} to groups`}
        types={["Group"]}
        assigned={new Set(groups.map((g) => `Group:${g.id}`))}
        onPick={(grantee) => add.mutateAsync(grantee)}
      />
    </div>
  );
}

// ---- Password reset -----------------------------------------------------------------

function ResetPasswordModal({ open, onClose, user }) {
  const [notify, setNotify] = useState(true);
  const [otp, setOtp] = useState(null);
  const reset = useAction(() => post(`/console/users/${user.id}/reset-password/`, { notify }), {
    invalidate: ["audit"],
    success: notify ? `Password reset email sent to ${user.email}.` : undefined,
    onSuccess: (data) => {
      onClose();
      if (!notify) setOtp(data.oneTimePassword ?? "");
    },
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Reset password for ${user.displayName}`}
        size="sm"
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={reset.isPending} onClick={() => reset.mutate()}>
              Reset password
            </Button>
          </>
        }
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">How should the user get their new password?</legend>
          {[
            { value: true, icon: Mail, title: "Email a reset link", body: `OCI sends a link to ${user.email || "their email"}.` },
            { value: false, icon: KeyRound, title: "Generate a one-time password", body: "You give it to them. They must change it at next sign-in." },
          ].map((option) => (
            <label
              key={option.title}
              className={cx(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                notify === option.value
                  ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              )}
            >
              <input type="radio" name="reset" className="sr-only" checked={notify === option.value}
                onChange={() => setNotify(option.value)} />
              <option.icon className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{option.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Modal>
      <SecretDialog
        open={otp !== null}
        onClose={() => setOtp(null)}
        title="One-time password"
        fields={[{ label: "One-time password", value: otp ?? "", secret: true }]}
        note={
          otp
            ? "Give this to the user through a trusted channel. It won't be shown again."
            : "The password was reset, but OCI didn't return a one-time password. Ask the user to use “Forgot password”."
        }
      />
    </>
  );
}

// ---- Credentials -----------------------------------------------------------------------

const CREDENTIAL_HELP = {
  api_key: "Signs OCI API, CLI and SDK requests. You upload the public key; the private key never leaves the user.",
  auth_token: "A password for services that can't use the console password, such as the container registry or Swift.",
  customer_secret_key: "Access key and secret for the Object Storage Amazon S3 compatibility API.",
  smtp: "Username and password for sending email through OCI Email Delivery.",
  oauth2: "Client ID and secret for calling OCI REST APIs with OAuth 2.0 on the user's behalf.",
};

function CredentialsTab({ user }) {
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const creds = useQuery({
    queryKey: ["users", "credentials", user.id],
    queryFn: () => get(`/console/users/${user.id}/credentials/`),
  });
  const remove = useAction((c) => del(`/console/users/${user.id}/credentials/${c.type}/${c.id}/`), {
    invalidate: ["users", "audit"],
    success: (_, c) => `Deleted ${c.label.toLowerCase()}.`,
    onSuccess: () => setDeleting(null),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Keys and tokens this user can use with OCI services.</p>
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Add credential
        </Button>
      </div>

      {creds.isPending ? (
        <Spinner />
      ) : creds.isError ? (
        <ErrorState error={creds.error} onRetry={creds.refetch} />
      ) : creds.data.length === 0 ? (
        <EmptyState icon={KeyRound} title="No credentials">This user only signs in with their password.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {creds.data.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <StatusBadge active={c.status === "ACTIVE"} />
                  </div>
                  {c.description && <p className="text-sm text-slate-600 dark:text-slate-300">{c.description}</p>}
                  <dl className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {c.fingerprint && <div className="truncate font-mono">Fingerprint {c.fingerprint}</div>}
                    {c.accessKey && <div className="truncate font-mono">Access key {c.accessKey}</div>}
                    {c.userName && <div className="truncate font-mono">Username {c.userName}</div>}
                    {c.scopes?.length > 0 && <div className="truncate">Scopes {c.scopes.join(", ")}</div>}
                    <div>
                      Created {formatDate(c.createdAt)}
                      {c.expiresOn && ` · expires ${formatDate(c.expiresOn)}`}
                    </div>
                  </dl>
                </div>
                <IconButton icon={Trash2} label={`Delete ${c.label}`} onClick={() => setDeleting(c)}
                  className="hover:text-rose-600 dark:hover:text-rose-400" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddCredentialModal
        open={adding}
        onClose={() => setAdding(false)}
        user={user}
        onCreated={(result) => {
          setAdding(false);
          if (result.secret || result.credential.accessKey) setRevealed(result);
        }}
      />
      <SecretDialog
        open={Boolean(revealed)}
        onClose={() => setRevealed(null)}
        title={`New ${revealed?.credential.label.toLowerCase() ?? "credential"}`}
        fields={[
          { label: "Username", value: revealed?.credential.userName },
          { label: "Access key", value: revealed?.credential.accessKey },
          { label: "Secret", value: revealed?.secret, secret: true },
        ]}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        pending={remove.isPending}
        title={`Delete this ${deleting?.label.toLowerCase()}?`}
        confirmLabel="Delete"
      >
        Anything still using it stops working straight away.
      </ConfirmDialog>
    </div>
  );
}

const EMPTY_CREDENTIAL = { type: "auth_token", description: "", expiresOn: "", key: "", name: "", audience: "", scope: "" };

function AddCredentialModal({ open, onClose, user, onCreated }) {
  const [form, setForm] = useState(EMPTY_CREDENTIAL);
  const status = useQuery({ queryKey: ["status"], queryFn: () => get("/console/status/"), staleTime: Infinity });
  const create = useAction(
    () =>
      post(`/console/users/${user.id}/credentials/`, {
        type: form.type,
        description: form.description,
        ...(form.expiresOn && form.type !== "api_key" && { expiresOn: `${form.expiresOn}T23:59:59Z` }),
        ...(form.type === "api_key" && { key: form.key }),
        ...(form.type === "oauth2" && {
          name: form.name,
          scopes: form.audience || form.scope ? [{ audience: form.audience, scope: form.scope }] : [],
        }),
      }),
    {
      invalidate: ["users", "audit"],
      success: (data) => `Added ${data.credential.label.toLowerCase()}.`,
      onSuccess: (data) => {
        setForm(EMPTY_CREDENTIAL);
        onCreated(data);
      },
    }
  );
  const errors = create.error?.fields ?? {};
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function close() {
    setForm(EMPTY_CREDENTIAL);
    create.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Add credential for ${user.displayName}`}
      onSubmit={() => create.mutate()}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add credential
          </Button>
        </>
      }
    >
      <Select label="Type" value={form.type} onChange={set("type")} hint={CREDENTIAL_HELP[form.type]}>
        {Object.entries(status.data?.credentialTypes ?? { [form.type]: form.type }).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      {form.type === "oauth2" && (
        <Input label="Name" value={form.name} onChange={set("name")} error={errors.name} required />
      )}
      <Input label="Description" value={form.description} onChange={set("description")} error={errors.description}
        placeholder="What it's for, e.g. “Nightly backup job”" />
      {form.type === "api_key" && (
        <Textarea
          label="Public key (PEM)"
          rows={6}
          value={form.key}
          onChange={set("key")}
          error={errors.key}
          className="[&_textarea]:font-mono [&_textarea]:text-xs"
          placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"}
          hint="Generate the key pair on the user's machine (oci setup keys) and paste only the public key."
        />
      )}
      {form.type === "oauth2" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Scope audience" value={form.audience} onChange={set("audience")} error={errors.scopes}
            placeholder="https://objectstorage…" />
          <Input label="Scope" value={form.scope} onChange={set("scope")} placeholder="/read" />
        </div>
      )}
      {form.type !== "api_key" && (
        <Input label="Expires on (optional)" type="date" value={form.expiresOn} onChange={set("expiresOn")}
          error={errors.expiresOn} min={new Date().toISOString().slice(0, 10)} />
      )}
    </Modal>
  );
}
