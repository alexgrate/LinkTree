import { Moon, Sun } from "lucide-react";

export default function Header({ theme, onToggleTheme, totalApps }) {
  const isDark = theme === "dark";

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {/* White tile keeps the purple logo visible in dark mode too. */}
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <img src="/logo.png" alt="Dash MFB logo" className="size-full object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Dash MFB
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {totalApps == null
              ? "Every internal application in one place"
              : `${totalApps} internal ${totalApps === 1 ? "application" : "applications"} in one place`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="rounded-xl p-2.5 text-slate-500 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
      >
        {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
    </header>
  );
}
