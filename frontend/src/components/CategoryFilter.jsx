import { motion } from "motion/react";

export default function CategoryFilter({ categories, activeId, onChange }) {
  const total = categories.reduce((sum, category) => sum + category.links.length, 0);
  const options = [
    { id: null, name: "All", count: total },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: category.links.length,
    })),
  ];

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((option) => {
        const isActive = option.id === activeId;
        return (
          <button
            key={option.id ?? "all"}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.id)}
            className={`relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors ${
              isActive
                ? "text-white ring-transparent"
                : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:text-white"
            }`}
          >
            {/* One shared pill slides between the active buttons. */}
            {isActive && (
              <motion.span
                layoutId="active-category-pill"
                className="absolute inset-0 rounded-full bg-brand-600 dark:bg-brand-500"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative block max-w-56 truncate">
              {option.name}
              <span className="ml-1.5 opacity-70">{option.count}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
