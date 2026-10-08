const STYLES = {
  PROD: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25",
  UAT: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25",
  DR: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/25",
};

const FALLBACK =
  "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/25";

export default function EnvBadge({ environment, label }) {
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset ${STYLES[environment] ?? FALLBACK}`}
    >
      {environment}
    </span>
  );
}
