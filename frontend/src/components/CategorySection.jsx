import { AnimatePresence, motion } from "motion/react";
import { Folder } from "lucide-react";
import AppCard from "./AppCard";
import AppIcon from "./AppIcon";

export default function CategorySection({ category, ref }) {
  const headingId = `category-${category.id}`;

  return (
    <motion.section
      ref={ref}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      aria-labelledby={headingId}
    >
      <div className="mb-4 flex items-center gap-2">
        <AppIcon
          name={category.icon}
          fallback={Folder}
          className="size-4 text-brand-600 dark:text-brand-400"
        />
        <h2
          id={headingId}
          className="text-sm font-semibold tracking-wider text-slate-700 uppercase dark:text-slate-300"
        >
          {category.name}
        </h2>
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {category.links.length}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {category.links.map((app, index) => (
            <AppCard key={app.id} app={app} index={index} />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
