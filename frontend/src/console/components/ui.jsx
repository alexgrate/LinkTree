import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { cx } from "../lib";

// ---- Buttons -----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-500/85",
  secondary:
    "bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={loading || props.disabled}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="size-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        className
      )}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

// ---- Form fields ----------------------------------------------------------------

const CONTROL =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800";

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children(id, error ? `${id}-error` : hint ? `${id}-hint` : undefined)}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
          {[error].flat().join(" ")}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Input({ label, hint, error, className, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cx(CONTROL, error && "border-rose-400 dark:border-rose-500")}
          {...props}
        />
      )}
    </Field>
  );
}

export function Textarea({ label, hint, error, className, rows = 3, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cx(CONTROL, "resize-y", error && "border-rose-400 dark:border-rose-500")}
          {...props}
        />
      )}
    </Field>
  );
}

export function Select({ label, hint, error, className, children, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={CONTROL} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none",
          checked ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }) {
  return (
    <div className={cx("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(CONTROL, "pl-9")}
      />
    </div>
  );
}

// ---- Display ---------------------------------------------------------------------

const TONES = {
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/25",
  brand:
    "bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/25",
  slate:
    "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/25",
};

export function Badge({ tone = "slate", children, className }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ active, on = "Active", off = "Inactive" }) {
  return (
    <Badge tone={active ? "green" : "slate"}>
      <span className={cx("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
      {active ? on : off}
    </Badge>
  );
}

export function Avatar({ name, size = "md" }) {
  const initials =
    (name || "?")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "?";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
        size === "lg" ? "size-12 text-base" : size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs"
      )}
    >
      {initials}
    </span>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Couldn't load this</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{error?.message}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Card({ className, children }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ start, count, total, onChange }) {
  if (total <= count) return null;
  const end = Math.min(start + count - 1, total);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          disabled={start <= 1}
          onClick={() => onChange(Math.max(1, start - count))}
        />
        <IconButton
          icon={ChevronRight}
          label="Next page"
          disabled={end >= total}
          onClick={() => onChange(start + count)}
        />
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={cx(
            "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition",
            tab.id === active
              ? "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          )}
        >
          {tab.label}
          {tab.count != null && <span className="ml-1.5 opacity-60">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---- Secrets -------------------------------------------------------------------

export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the value is still selectable on screen.
    }
  }
  return <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : label} onClick={copy} />;
}

export function CopyField({ label, value, secret = false }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 dark:border-slate-700 dark:bg-slate-800/60">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-800 dark:text-slate-100">
          {shown ? value : "•".repeat(Math.min(value.length, 32))}
        </code>
        {secret && (
          <IconButton icon={shown ? EyeOff : Eye} label={shown ? "Hide" : "Show"} onClick={() => setShown(!shown)} />
        )}
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

// ---- Dialogs ---------------------------------------------------------------------

// Native <dialog>: focus is trapped, Esc closes it, and the page behind is inert.
function useDialog(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    function handleCancel(event) {
      event.preventDefault();
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);
  return ref;
}

export function Modal({ open, onClose, title, description, children, footer, size = "md", onSubmit }) {
  const ref = useDialog(open, onClose);
  const Body = onSubmit ? "form" : "div";
  return (
    <dialog
      ref={ref}
      onClick={(event) => event.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-100",
        size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-md" : "max-w-lg"
      )}
    >
      {open && (
        <Body
          {...(onSubmit && {
            onSubmit: (event) => {
              event.preventDefault();
              onSubmit(event);
            },
            noValidate: true,
          })}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
          </div>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
              {footer}
            </div>
          )}
        </Body>
      )}
    </dialog>
  );
}

export function Drawer({ open, onClose, title, subtitle, actions, children }) {
  const ref = useDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px] dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="min-w-0 flex-1">{title}</div>
            <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
          </div>
          {(subtitle || actions) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
              {subtitle}
              <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", tone = "danger", pending }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </Modal>
  );
}

// Shown once after creating a credential or app: the secret can't be retrieved later.
export function SecretDialog({ open, onClose, title, fields, note }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="primary" onClick={onClose}>
          I've saved it
        </Button>
      }
    >
      <div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{note ?? "Copy this now and store it in the password vault. It won't be shown again."}</p>
      </div>
      {fields
        .filter((field) => field.value)
        .map((field) => (
          <CopyField key={field.label} label={field.label} value={field.value} secret={field.secret} />
        ))}
    </Modal>
  );
}
