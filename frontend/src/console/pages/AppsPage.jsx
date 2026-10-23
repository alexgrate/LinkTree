import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { AppWindow, Eye, Globe, Plus, Power, Send, Trash2, Users, UsersRound, X } from "lucide-react";
import { del, get, patch, post } from "../api";
import { cx, formatDate, useAction, useDebounced } from "../lib";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyField,
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

const PAGE_SIZE = 24;

const APP_TYPE_HELP = {
  confidential: "A server-side app that keeps a client secret: web apps, APIs, background jobs.",
  public: "A mobile or browser app that can't keep a secret. Uses authorization code with PKCE.",
};

const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);

export default function AppsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("app");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(1);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const q = useDebounced(query.trim());

  const apps = useQuery({
    queryKey: ["apps", q, start],
    queryFn: () => get("/console/apps/", { q, start, count: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const select = (id) => setParams(id ? { app: id } : {});

  return (
    <>
      <PageHeader
        title="Integrated applications"
        description="Applications that sign in with the identity domain: who can use them, and their OAuth credentials."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New application
          </Button>
        }
      />

      <SearchInput
        value={query}
        onChange={(value) => {
          setQuery(value);
          setStart(1);
        }}
        placeholder="Search applications"
        className="mb-4"
      />

      {apps.isPending ? (
        <Spinner />
      ) : apps.isError ? (
        <Card>
          <ErrorState error={apps.error} onRetry={apps.refetch} />
        </Card>
      ) : apps.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={AppWindow} title="No applications found">
            {q ? `Nothing matches “${q}”.` : "Register an application so it can sign users in with OCI."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.data.items.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => select(app.id)}
                  className="flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      <AppWindow className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900 dark:text-white">{app.displayName}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">{app.appType}</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                    {app.description || "No description"}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-4">
                    <StatusBadge active={app.active} />
                    {app.oracleManaged && <Badge>Oracle-managed</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Card className="mt-4 empty:hidden">
            <Pagination start={start} count={PAGE_SIZE} total={apps.data.total} onChange={setStart} />
          </Card>
        </>
      )}

      <CreateAppModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(app) => {
          setCreating(false);
          select(app.id);
          if (app.clientSecret || app.clientId) setCreated(app);
        }}
      />
      <SecretDialog
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        title={`${created?.displayName ?? "Application"} credentials`}
        fields={[
          { label: "Client ID", value: created?.clientId },
          { label: "Client secret", value: created?.clientSecret, secret: true },
        ]}
        note="Store the client secret in the application's configuration or the password vault. You can view it again from the Credentials tab, and every view is logged."
      />
      <AppDrawer appId={selected} onClose={() => select(null)} />
    </>
  );
}

// ---- Create -----------------------------------------------------------------------

const EMPTY_APP = { appType: "confidential", displayName: "", description: "", homeUrl: "", redirectUris: "" };

function CreateAppModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_APP);
  const status = useQuery({ queryKey: ["status"], queryFn: () => get("/console/status/"), staleTime: Infinity });
  const create = useAction(
    () =>
      post("/console/apps/", {
        ...form,
        redirectUris: lines(form.redirectUris),
        // Apps with a sign-in page need the authorization code flow.
        ...(form.appType === "confidential" &&
          lines(form.redirectUris).length > 0 && { allowedGrants: ["authorization_code", "client_credentials", "refresh_token"] }),
      }),
    {
      invalidate: ["apps", "overview"],
      success: (app) => `Created ${app.displayName}.`,
      onSuccess: (app) => {
        setForm(EMPTY_APP);
        onCreated(app);
      },
    }
  );
  const errors = create.error?.fields ?? {};
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function close() {
    setForm(EMPTY_APP);
    create.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New application"
      size="lg"
      onSubmit={() => create.mutate()}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create application
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Type</legend>
        {Object.entries(status.data?.appTypes ?? {}).map(([value, label]) => (
          <label
            key={value}
            className={cx(
              "cursor-pointer rounded-xl border p-3 transition",
              form.appType === value
                ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
            )}
          >
            <input type="radio" name="appType" value={value} className="sr-only"
              checked={form.appType === value} onChange={set("appType")} />
            <span className="block text-sm font-medium">{label.split(" (")[0]}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{APP_TYPE_HELP[value]}</span>
          </label>
        ))}
      </fieldset>
      <Input label="Name" value={form.displayName} onChange={set("displayName")} error={errors.displayName} required autoFocus />
      <Textarea label="Description" rows={2} value={form.description} onChange={set("description")} error={errors.description} />
      <Input label="Home page URL" value={form.homeUrl} onChange={set("homeUrl")} error={errors.homeUrl}
        placeholder="https://app.dash-mfb.com" hint="Where users land from the OCI My Apps page. Needed to publish it to the directory." />
      <Textarea
        label="Redirect URLs"
        rows={2}
        value={form.redirectUris}
        onChange={set("redirectUris")}
        error={errors.redirectUris}
        placeholder="https://app.dash-mfb.com/auth/callback"
        hint="One per line. Leave empty for service-to-service (client credentials) apps."
      />
    </Modal>
  );
}

// ---- Detail drawer --------------------------------------------------------------------

function AppDrawer({ appId, onClose }) {
  const [tab, setTab] = useState("details");
  const [confirm, setConfirm] = useState(null); // "status" | "delete"
  const [publishing, setPublishing] = useState(false);

  const app = useQuery({
    queryKey: ["apps", "detail", appId],
    queryFn: () => get(`/console/apps/${appId}/`),
    enabled: Boolean(appId),
  });
  const a = app.data;

  const setActive = useAction((active) => post(`/console/apps/${appId}/${active ? "activate" : "deactivate"}/`), {
    invalidate: ["apps", "overview"],
    success: (data) => `${data.displayName} is now ${data.active ? "active" : "inactive"}.`,
    onSuccess: () => setConfirm(null),
  });
  const remove = useAction(() => del(`/console/apps/${appId}/`), {
    invalidate: ["apps", "overview"],
    success: () => `Deleted ${a.displayName}.`,
    onSuccess: () => {
      setConfirm(null);
      onClose();
    },
  });

  function close() {
    setTab("details");
    onClose();
  }

  return (
    <Drawer
      open={Boolean(appId)}
      onClose={close}
      title={
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <AppWindow className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{a?.displayName ?? "Application"}</h2>
            {a && <p className="truncate text-sm text-slate-500 dark:text-slate-400">{a.appType}</p>}
          </div>
        </div>
      }
      subtitle={
        a && (
          <div className="flex gap-1">
            <StatusBadge active={a.active} />
            {a.oracleManaged && <Badge>Oracle-managed</Badge>}
          </div>
        )
      }
      actions={
        a && (
          <>
            <Button size="sm" icon={Send} onClick={() => setPublishing(true)} disabled={!a.homeUrl}
              title={a.homeUrl ? undefined : "Set a home page URL first"}>
              Publish
            </Button>
            <Button size="sm" icon={Power} onClick={() => setConfirm("status")} disabled={a.oracleManaged}>
              {a.active ? "Deactivate" : "Activate"}
            </Button>
            {!a.oracleManaged && (
              <IconButton icon={Trash2} label="Delete application" onClick={() => setConfirm("delete")}
                className="hover:text-rose-600 dark:hover:text-rose-400" />
            )}
          </>
        )
      }
    >
      {app.isPending ? (
        <Spinner />
      ) : app.isError ? (
        <ErrorState error={app.error} onRetry={app.refetch} />
      ) : (
        <div className="space-y-5">
          <Tabs
            tabs={[
              { id: "details", label: "Details" },
              { id: "access", label: "Users & groups" },
              ...(a.clientId ? [{ id: "credentials", label: "Credentials" }] : []),
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === "details" && <AppDetailsTab key={a.id} app={a} />}
          {tab === "access" && <AppAccessTab app={a} />}
          {tab === "credentials" && <AppCredentialsTab app={a} />}
        </div>
      )}

      {a && (
        <>
          <ConfirmDialog
            open={confirm === "status"}
            onClose={() => setConfirm(null)}
            onConfirm={() => setActive.mutate(!a.active)}
            pending={setActive.isPending}
            tone={a.active ? "danger" : "primary"}
            title={a.active ? `Deactivate ${a.displayName}?` : `Activate ${a.displayName}?`}
            confirmLabel={a.active ? "Deactivate" : "Activate"}
          >
            {a.active
              ? "Nobody can sign in to it and its client credentials stop working until it's reactivated."
              : "Users and groups with access can sign in again."}
          </ConfirmDialog>
          <ConfirmDialog
            open={confirm === "delete"}
            onClose={() => setConfirm(null)}
            onConfirm={() => remove.mutate()}
            pending={remove.isPending}
            title={`Delete ${a.displayName}?`}
            confirmLabel="Delete application"
          >
            The application is deactivated and deleted from OCI, with its access grants and client credentials. It
            can't be undone.
          </ConfirmDialog>
          <PublishModal open={publishing} onClose={() => setPublishing(false)} app={a} />
        </>
      )}
    </Drawer>
  );
}

function AppDetailsTab({ app }) {
  const initial = {
    displayName: app.displayName,
    description: app.description,
    homeUrl: app.homeUrl,
    redirectUris: app.redirectUris.join("\n"),
  };
  const [form, setForm] = useState(initial);
  const save = useAction(
    () => patch(`/console/apps/${app.id}/`, { ...form, redirectUris: lines(form.redirectUris) }),
    { invalidate: ["apps"], success: "Application saved." }
  );
  const errors = save.error?.fields ?? {};
  const changed = Object.entries(form).some(([key, value]) => value !== initial[key]);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={app.oracleManaged} className="space-y-4">
        <Input label="Name" value={form.displayName} onChange={set("displayName")} error={errors.displayName} />
        <Textarea label="Description" rows={2} value={form.description} onChange={set("description")} error={errors.description} />
        <Input label="Home page URL" value={form.homeUrl} onChange={set("homeUrl")} error={errors.homeUrl} />
        {app.clientId && (
          <Textarea label="Redirect URLs" rows={3} value={form.redirectUris} onChange={set("redirectUris")}
            error={errors.redirectUris} hint="One per line." />
        )}
      </fieldset>
      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Created</dt>
          <dd>{formatDate(app.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Grant types</dt>
          <dd className="truncate">{app.allowedGrants.join(", ").replaceAll("_", " ") || "—"}</dd>
        </div>
      </dl>
      {!app.oracleManaged && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!changed} loading={save.isPending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}

function AppAccessTab({ app }) {
  const [picking, setPicking] = useState(false);
  const grants = useQuery({
    queryKey: ["apps", "grants", app.id],
    queryFn: () => get(`/console/apps/${app.id}/grants/`),
  });
  const grant = useAction((grantee) => post(`/console/apps/${app.id}/grants/`, { type: grantee.type, id: grantee.id }), {
    invalidate: ["apps"],
    success: (data) => `${data.display} can now use ${app.displayName}.`,
  });
  const revoke = useAction((g) => del(`/console/apps/${app.id}/grants/${g.grantId}/`), {
    invalidate: ["apps"],
    success: (_, g) => `Removed ${g.display}'s access.`,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Who can sign in to this application.</p>
        <Button size="sm" icon={Plus} onClick={() => setPicking(true)}>
          Assign
        </Button>
      </div>
      {grants.isPending ? (
        <Spinner />
      ) : grants.isError ? (
        <ErrorState error={grants.error} onRetry={grants.refetch} />
      ) : grants.data.length === 0 ? (
        <EmptyState icon={Users} title="Nobody assigned">Assign groups so access follows team membership.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {grants.data.map((g) => (
            <li key={g.grantId} className="flex items-center gap-3 px-4 py-2.5">
              {g.type === "Group" ? (
                <UsersRound className="size-4 text-slate-400" aria-hidden="true" />
              ) : (
                <Users className="size-4 text-slate-400" aria-hidden="true" />
              )}
              <span className="flex-1 truncate text-sm font-medium">{g.display}</span>
              <Badge>{g.type}</Badge>
              <IconButton icon={X} label={`Remove ${g.display}`} disabled={revoke.isPending} onClick={() => revoke.mutate(g)} />
            </li>
          ))}
        </ul>
      )}
      <GranteePicker
        open={picking}
        onClose={() => setPicking(false)}
        title={`Assign ${app.displayName}`}
        assigned={new Set((grants.data ?? []).map((g) => `${g.type}:${g.id}`))}
        onPick={(grantee) => grant.mutateAsync(grantee)}
      />
    </div>
  );
}

function AppCredentialsTab({ app }) {
  const [secret, setSecret] = useState(null);
  const reveal = useAction(() => post(`/console/apps/${app.id}/secret/`), {
    invalidate: ["audit"],
    onSuccess: (data) => setSecret(data.clientSecret ?? ""),
  });

  return (
    <div className="space-y-4">
      <CopyField label="Client ID" value={app.clientId} />
      {secret === null ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-300">
            The client secret is hidden. Viewing it is recorded in the audit log.
          </p>
          <Button size="sm" icon={Eye} className="mt-3" loading={reveal.isPending} onClick={() => reveal.mutate()}>
            Show client secret
          </Button>
        </div>
      ) : secret ? (
        <CopyField label="Client secret" value={secret} secret />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This application has no client secret (public clients don't use one).
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Token endpoint: <code className="font-mono">&lt;identity domain URL&gt;/oauth2/v1/token</code>
      </p>
    </div>
  );
}

function PublishModal({ open, onClose, app }) {
  const [categoryId, setCategoryId] = useState("");
  const [environment, setEnvironment] = useState("PROD");
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => get("/console/categories/"),
    enabled: open,
  });
  const publish = useAction(() => post(`/console/apps/${app.id}/publish/`, { categoryId: Number(categoryId), environment }), {
    invalidate: ["links", "categories", "overview"],
    success: `${app.displayName} is on the app directory.`,
    onSuccess: onClose,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish to the app directory"
      description={`Adds ${app.displayName} to the staff app directory page, linking to ${app.homeUrl}.`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Globe} loading={publish.isPending} disabled={!categoryId} onClick={() => publish.mutate()}>
            Publish
          </Button>
        </>
      }
    >
      <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
        hint={categories.data?.length === 0 ? "Create a category under Links & categories first." : undefined}>
        <option value="">Choose a category…</option>
        {(categories.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select label="Environment" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
        <option value="PROD">Production</option>
        <option value="UAT">UAT</option>
        <option value="DR">Disaster Recovery</option>
      </Select>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        If it's already in that category, its link and description are updated instead.
      </p>
    </Modal>
  );
}
