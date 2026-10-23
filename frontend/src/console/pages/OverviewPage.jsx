import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertTriangle, AppWindow, ArrowRight, LayoutGrid, ShieldCheck, Users, UsersRound } from "lucide-react";
import { get } from "../api";
import { useSession } from "../lib";
import { Card, ErrorState, PageHeader, Spinner } from "../components/ui";
import { ActivityList } from "./AuditPage";

function Stat({ to, icon: Icon, label, value, detail }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
    >
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <ArrowRight
          className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600"
          aria-hidden="true"
        />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
        {value ?? "—"}
      </div>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</div>}
    </Link>
  );
}

export default function OverviewPage() {
  const user = useSession();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => get("/console/overview/") });

  if (overview.isPending) return <Spinner />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={overview.refetch} />;

  const { directory: d, directoryError, portal, recentActivity } = overview.data;
  const firstName = user.displayName.split(" ")[0];

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} description="Your identity domain and app directory at a glance." />

      {directoryError && (
        <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Can't reach the OCI identity domain</p>
            <p className="mt-0.5">{directoryError}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat to="/users" icon={Users} label="Users" value={d?.users}
          detail={d && `${d.activeUsers} active · ${d.users - d.activeUsers} inactive`} />
        <Stat to="/groups" icon={UsersRound} label="Groups" value={d?.groups} />
        <Stat to="/integrated-apps" icon={AppWindow} label="Integrated apps" value={d?.apps}
          detail={d && `${d.activeApps} active`} />
        <Stat to="/admin-roles" icon={ShieldCheck} label="Administrators" value={d?.admins}
          detail="Users and groups with an admin role" />
        <Stat to="/directory" icon={LayoutGrid} label="Directory links" value={portal.links}
          detail={`${portal.activeLinks} shown · ${portal.categories} categories`} />
      </div>

      <Card className="mt-8">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold">Recent activity</h2>
          <Link to="/audit" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Full audit log
          </Link>
        </div>
        <ActivityList events={recentActivity} />
      </Card>
    </>
  );
}
