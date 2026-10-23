import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { ToastContext } from "../lib";

let nextId = 1;

export default function Toaster({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (tone, message) => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({ success: (m) => show("success", m), error: (m) => show("error", m) }),
    [show]
  );

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                role={toast.tone === "error" ? "alert" : "status"}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 size-4 shrink-0 ${toast.tone === "error" ? "text-rose-500" : "text-emerald-500"}`}
                />
                <p className="flex-1 text-slate-700 dark:text-slate-200">{toast.message}</p>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(toast.id)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}
