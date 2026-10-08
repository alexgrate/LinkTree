import { motion } from "motion/react";
import { ArrowUpRight, LifeBuoy, Users } from "lucide-react";
import AppIcon from "./AppIcon";
import EnvBadge from "./EnvBadge";

// `ref` is forwarded so AnimatePresence's popLayout mode can measure the card as it exits.
export default function AppCard({ app, index = 0, ref }) {
  const hasFooter = app.owner_team || app.support_contact;

  return (
    <motion.a
      ref={ref}
      layout
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: "easeOut", delay: Math.min(index, 8) * 0.04 },
      }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-lg hover:shadow-brand-900/5 focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          <AppIcon name={app.icon} className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900 dark:text-white">{app.name}</h3>
            <EnvBadge environment={app.environment} label={app.environment_label} />
          </div>
          {app.description && (
            <p className="mt-1 line-clamp-2 text-sm wrap-anywhere text-slate-500 dark:text-slate-400">
              {app.description}
            </p>
          )}
        </div>

        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-400"
        />
      </div>

      {hasFooter && (
        <div className="mt-auto pt-4">
          <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {app.owner_team && (
              <div className="flex items-center gap-2">
                <dt>
                  <Users className="size-3.5" aria-label="Owner team" />
                </dt>
                <dd className="truncate">{app.owner_team}</dd>
              </div>
            )}
            {app.support_contact && (
              <div className="flex items-center gap-2">
                <dt>
                  <LifeBuoy className="size-3.5" aria-label="Support contact" />
                </dt>
                <dd className="truncate">{app.support_contact}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </motion.a>
  );
}
