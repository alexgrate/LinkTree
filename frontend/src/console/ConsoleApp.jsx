import { lazy, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router";
import { MotionConfig } from "motion/react";
import { get } from "./api";
import { SessionContext, useSession } from "./lib";
import Toaster from "./components/Toaster";
import { Spinner } from "./components/ui";
import Layout from "./Layout";
import ApplicationsPage from "./pages/ApplicationsPage";
import LoginPage from "./pages/LoginPage";

// Management pages are downloaded only by staff who open them.
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const AppsPage = lazy(() => import("./pages/AppsPage"));
const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const DirectoryPage = lazy(() => import("./pages/DirectoryPage"));
const ConsoleAdminsPage = lazy(() => import("./pages/ConsoleAdminsPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry what will fail again: missing permission, bad input, not found.
        retry: (count, error) => count < 2 && (!error.status || error.status >= 500),
      },
    },
  });
}

// Management pages need a signed-in staff account; anyone else is sent to sign in first.
function RequireStaff({ superuser = false }) {
  const user = useSession();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  if (superuser && !user.isSuperuser) return <Navigate to="/overview" replace />;
  return <Outlet />;
}

// Bookmarks from before the console became the whole app: /console/users -> /users.
function LegacyConsoleRedirect() {
  const { "*": rest } = useParams();
  const { search } = useLocation();
  const path = rest === "apps" ? "integrated-apps" : rest || "overview";
  return <Navigate to={`/${path}${search}`} replace />;
}

function AppRoutes() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => get("/auth/session/"), staleTime: Infinity });
  if (session.isPending) return <Spinner label="Loading" />;

  // If the session check fails, carry on signed out: the app directory still works.
  const user = session.data?.user ?? null;

  return (
    <SessionContext value={user}>
      <Routes>
        <Route path="sign-in" element={<LoginPage />} />
        <Route path="console/*" element={<LegacyConsoleRedirect />} />
        <Route element={<Layout />}>
          <Route index element={<ApplicationsPage />} />
          <Route element={<RequireStaff />}>
            <Route path="overview" element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="integrated-apps" element={<AppsPage />} />
            <Route path="admin-roles" element={<AdminRolesPage />} />
            <Route path="directory" element={<DirectoryPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route element={<RequireStaff superuser />}>
            <Route path="admins" element={<ConsoleAdminsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionContext>
  );
}

export default function ConsoleApp() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" turns animations off for people who've asked their OS for less motion. */}
      <MotionConfig reducedMotion="user">
        <Toaster>
          <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <AppRoutes />
          </div>
        </Toaster>
      </MotionConfig>
    </QueryClientProvider>
  );
}
