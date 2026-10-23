import { Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  AppWindow,
  Cloud,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { get, post } from "./api";
import { useTheme } from "../hooks/useTheme";
import { cx, useSession } from "./lib";
import { Avatar, Badge, Drawer, IconButton, Spinner } from "./components/ui";

// `staff` items need a signed-in staff account; `superuser` items need a superuser.
const NAV = [
  {
    section: null,
    items: [
      { to: "/", label: "Applications", icon: LayoutGrid, end: true },
      { to: "/overview", label: "Overview", icon: LayoutDashboard, staff: true },
    ],
  },
  {
    section: "Identity domain",
    items: [
      { to: "/users", label: "Users", icon: Users, staff: true },
      { to: "/groups", label: "Groups", icon: UsersRound, staff: true },
      { to: "/integrated-apps", label: "Integrated apps", icon: AppWindow, staff: true },
      { to: "/admin-roles", label: "Admin roles", icon: ShieldCheck, staff: true },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/directory", label: "Manage links", icon: Settings2, staff: true },
      { to: "/admins", label: "Console admins", icon: UserCog, superuser: true },
      { to: "/audit", label: "Audit log", icon: ScrollText, staff: true },
    ],
  },
];

function DomainBadge() {
  const status = useQuery({ queryKey: ["status"], queryFn: () => get("/console/status/"), staleTime: Infinity });
  if (!status.data) return null;
  if (status.data.mode === "demo") {
    return (
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        <div className="flex items-center gap-1.5 font-semibold">
          <FlaskConical className="size-3.5" aria-hidden="true" /> Demo data
        </div>
        <p className="mt-1 opacity-90">
          No OCI identity domain is configured. Changes are kept in memory until the server restarts.
        </p>
      </div>
    );
  }
  const host = new URL(status.data.domainUrl).host;
  const asUser = status.data.authMode === "user";
  return (
    <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
      <div className="flex items-center gap-1.5 font-semibold">
        <Cloud className="size-3.5" aria-hidden="true" /> OCI identity domain
      </div>
      <p className="mt-1 truncate opacity-90" title={status.data.domainUrl}>
        {host}
      </p>
      <p className="mt-1 opacity-90">
        {asUser
          ? "You act in OCI as yourself: your OCI admin role decides what you can change."
          : "Changes are made with the console's own OCI app."}
      </p>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  async function signOut() {
    const result = await post("/auth/logout/").catch(() => null);
    if (result?.logoutUrl) {
      // Signed in with AD: end the identity domain session too. It sends the browser back to /.
      window.location.assign(result.logoutUrl);
      return;
    }
    queryClient.clear();
    navigate("/");
  }

  const themeButton = (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    />
  );

  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2">
        {/* White tile keeps the purple logo visible in dark mode too. */}
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <img src="/logo.png" alt="Dash MFB logo" className="size-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold tracking-tight text-slate-900 dark:text-white">Dash MFB</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {user ? "Applications & identity" : "Internal applications"}
          </div>
        </div>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto" aria-label="Main">
        {NAV.map((group) => {
          const items = group.items.filter(
            (item) => (!item.staff && !item.superuser) || (user && (!item.superuser || user.isSuperuser))
          );
          if (!items.length) return null;
          return (
            <div key={group.section ?? "main"}>
              {group.section && (
                <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  {group.section}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cx(
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                          isActive
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {user && <DomainBadge />}

      {user ? (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Avatar name={user.displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.displayName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {user.isSuperuser ? <Badge tone="brand">Superuser</Badge> : "Staff"}
            </div>
          </div>
          {themeButton}
          <IconButton icon={LogOut} label="Sign out" onClick={signOut} />
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Link
            to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}
            onClick={onNavigate}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <LogIn className="size-4" aria-hidden="true" /> Staff sign in
          </Link>
          {themeButton}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900/60">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <IconButton icon={Menu} label="Open menu" onClick={() => setMenuOpen(true)} />
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-7 rounded-lg bg-white object-contain p-0.5" />
          <span className="font-semibold">Dash MFB</span>
        </Link>
      </header>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={<span className="font-semibold">Menu</span>}>
        <div className="-mx-6 -my-5 h-full">
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </div>
      </Drawer>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
