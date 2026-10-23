import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { get } from "../api";
import { formatDate, useDebounced } from "../lib";
import { Avatar, Card, EmptyState, ErrorState, IconButton, PageHeader, SearchInput, Select, Spinner } from "../components/ui";

const TARGETS = {
  user: "user",
  group: "group",
  app: "application",
  admin_role: "admin role",
  link: "directory link",
  category: "category",
  console_admin: "console admin",
  session: "console",
};

const ACTIONS = {
  signed_in: "signed in to the",
  reset_password: "reset the password of",
  created_credential: "added a credential for",
  deleted_credential: "deleted a credential of",
  added_members: "added members to",
  removed_member: "removed a member from",
  granted_access: "granted access to",
  revoked_access: "revoked access to",
  viewed_secret: "viewed the client secret of",
  granted_role: "assigned the admin role",
  revoked_role: "removed the admin role",
  published: "published to the directory:",
  republished: "updated in the directory:",
};

function describe(event) {
  const verb = ACTIONS[event.action] ?? event.action.replaceAll("_", " ");
  return { verb, target: TARGETS[event.targetType] ?? event.targetType };
}

function extra(detail) {
  if (detail.grantee) return detail.grantee;
  if (detail.credential) return detail.credential;
  if (detail.method) return `by ${detail.method}`;
  if (detail.fields?.length) return `changed ${detail.fields.join(", ")}`;
  return null;
}

export function ActivityList({ events }) {
  if (!events.length) {
    return <EmptyState icon={ScrollText} title="Nothing yet">Changes made in the console appear here.</EmptyState>;
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {events.map((event) => {
        const { verb, target } = describe(event);
        const more = extra(event.detail ?? {});
        return (
          <li key={event.id} className="flex items-start gap-3 px-5 py-3">
            <Avatar name={event.actor} size="sm" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-white">{event.actor}</span> {verb}{" "}
                {event.action !== "signed_in" && <span className="text-slate-500 dark:text-slate-400">{target} </span>}
                {event.action !== "signed_in" ? (
                  <span className="font-medium text-slate-900 dark:text-white">{event.targetLabel}</span>
                ) : (
                  target
                )}
              </p>
              {more && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{more}</p>}
            </div>
            <time
              dateTime={event.createdAt}
              className="shrink-0 text-xs text-slate-400 tabular-nums"
              title={event.ipAddress ? `From ${event.ipAddress}` : undefined}
            >
              {formatDate(event.createdAt, { time: true })}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

export default function AuditPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(query.trim());

  const events = useQuery({
    queryKey: ["audit", q, type, page],
    queryFn: () => get("/console/audit/", { q, type, page }),
    placeholderData: keepPreviousData,
  });

  const pages = events.data ? Math.max(1, Math.ceil(events.data.count / 50)) : 1;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made through this console: who did it, when and from where. Secrets are never recorded."
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search by person, target or action"
            className="min-w-56 flex-1"
          />
          <Select
            label={<span className="sr-only">Filter by type</span>}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className="w-48 [&>label]:sr-only"
          >
            <option value="">Everything</option>
            {Object.entries(TARGETS).map(([value, label]) => (
              <option key={value} value={value}>
                {label[0].toUpperCase() + label.slice(1)}s
              </option>
            ))}
          </Select>
        </div>
        {events.isPending ? (
          <Spinner />
        ) : events.isError ? (
          <ErrorState error={events.error} onRetry={events.refetch} />
        ) : (
          <>
            <ActivityList events={events.data.results} />
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">
                <span>
                  Page {page} of {pages} · {events.data.count} events
                </span>
                <div className="flex gap-1">
                  <IconButton icon={ChevronLeft} label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} />
                  <IconButton icon={ChevronRight} label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} />
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
