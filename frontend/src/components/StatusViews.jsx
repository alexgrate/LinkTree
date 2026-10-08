import { AlertTriangle, Inbox, SearchX } from "lucide-react";

export function LoadingView() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading applications">
      <div className="h-14 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
        ))}
      </div>
    </div>
  );
}

function Message({ icon: Icon, title, children, tone = "neutral" }) {
  const iconStyles =
    tone === "error"
      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className={`grid size-12 place-items-center rounded-2xl ${iconStyles}`}>
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  );
}

const buttonClass =
  "mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-500/85";

export function ErrorView({ message, onRetry }) {
  return (
    <Message icon={AlertTriangle} title="Couldn't load applications" tone="error">
      <p>{message}. Check that the Django server is running.</p>
      <button type="button" onClick={onRetry} className={buttonClass}>
        Try again
      </button>
    </Message>
  );
}

export function NoDataView({ adminUrl }) {
  return (
    <Message icon={Inbox} title="No applications yet">
      <p>
        Add categories and apps in the{" "}
        <a href={adminUrl} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          admin panel
        </a>{" "}
        and they'll appear here.
      </p>
    </Message>
  );
}

export function NoResultsView({ query, onClear }) {
  return (
    <Message icon={SearchX} title="No matching apps">
      <p>
        {query ? <>Nothing matches “{query}”.</> : "Nothing matches the current filter."} Try an
        alias or the owning team's name.
      </p>
      <button type="button" onClick={onClear} className={buttonClass}>
        Clear filters
      </button>
    </Message>
  );
}
