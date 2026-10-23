import { createContext, useContext, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(value, { time = false } = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(time && { hour: "2-digit", minute: "2-digit" }),
  });
}

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}

// A change made through the API: refreshes the listed queries and reports the outcome.
// Field errors stay on the form (mutation.error.fields); anything else becomes a toast.
export function useAction(mutationFn, { success, invalidate = [], onSuccess } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      if (success) toast.success(typeof success === "function" ? success(data, variables) : success);
      onSuccess?.(data, variables);
    },
    onError: (error) => {
      if (!Object.keys(error.fields ?? {}).length) toast.error(error.message);
    },
  });
}
