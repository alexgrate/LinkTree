import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AlertCircle, ArrowLeft, Building2, ChevronDown, LogIn } from "lucide-react";
import { get, post } from "../api";
import { useSession } from "../lib";
import { Button, Card, Input } from "../components/ui";

// Why an AD sign-in came back to this page (/sign-in?error=...). Codes come from console/sso.py.
const SSO_ERRORS = {
  not_authorized:
    "Your account isn't allowed to use the console. Ask IT to add you to the console's group in the identity domain.",
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was started in another tab. Try again.",
  invalid_token: "The identity domain's answer couldn't be verified. Try again, or tell IT if it keeps happening.",
  token_rejected: "The identity domain didn't accept the sign-in. Try again, or tell IT if it keeps happening.",
  unreachable: "Couldn't reach the OCI identity domain. Try again in a minute.",
  name_conflict: "A local console account already uses your username. Ask IT to remove or rename it.",
  sso_off: "Sign-in with your Dash MFB account isn't set up on this server.",
};

// Only follow redirects within this site ("/users"), never "//evil.example" or full URLs.
function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

function PasswordForm({ next }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => post("/auth/login/", { username, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(["session"], (old) => ({ ...old, ...data }));
      navigate(next === "/" ? "/overview" : next, { replace: true });
    },
    onError: () => setPassword(""),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        login.mutate();
      }}
    >
      {login.error && (
        <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {login.error.message}
        </div>
      )}
      <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)}
        autoComplete="username" autoCapitalize="none" required />
      <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password" required />
      <Button type="submit" variant="primary" icon={LogIn} loading={login.isPending}
        disabled={!username || !password} className="w-full">
        Sign in
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        5 wrong passwords block this network for 30 minutes.
      </p>
    </form>
  );
}

export default function LoginPage() {
  const user = useSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const ssoError = params.get("error");
  const [showLocal, setShowLocal] = useState(false);
  const session = useQuery({ queryKey: ["session"], queryFn: () => get("/auth/session/"), staleTime: Infinity });
  const { sso, local } = session.data?.signIn ?? { sso: false, local: true };

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
            <img src="/logo.png" alt="Dash MFB logo" className="size-full object-contain" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage OCI users, applications, credentials and the app directory.
          </p>
        </div>

        <Card className="space-y-4 p-6">
          {ssoError && (
            <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {SSO_ERRORS[ssoError] ?? "Sign-in failed. Try again."}
            </div>
          )}

          {sso && (
            <>
              {/* A full-page visit: the identity domain's sign-in page takes over, then returns here. */}
              <a
                href={`/api/auth/sso/start/?next=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none dark:bg-brand-500 dark:hover:bg-brand-500/85"
              >
                <Building2 className="size-4" aria-hidden="true" /> Sign in with your Dash MFB account
              </a>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Use your usual Windows (Active Directory) username and password.
              </p>
            </>
          )}

          {sso && local && (
            <button
              type="button"
              onClick={() => setShowLocal(!showLocal)}
              aria-expanded={showLocal}
              className="mx-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              Use a local emergency account
              <ChevronDown className={`size-3.5 transition ${showLocal ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          )}
          {local && (!sso || showLocal) && <PasswordForm next={next} />}
          {!sso && !local && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Sign-in isn't available. Ask IT to finish setting up the console.
            </p>
          )}
        </Card>

        <p className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to applications
          </Link>
        </p>
      </div>
    </div>
  );
}
