import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { ADMIN_URL, fetchCategories } from "./api/links";
import { useTheme } from "./hooks/useTheme";
import { filterCategories } from "./lib/search";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import CategoryFilter from "./components/CategoryFilter";
import CategorySection from "./components/CategorySection";
import { ErrorView, LoadingView, NoDataView, NoResultsView } from "./components/StatusViews";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const loadCategories = useCallback(() => {
    return fetchCategories()
      .then((data) => {
        setCategories(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function retry() {
    setStatus("loading");
    loadCategories();
  }

  function clearFilters() {
    setQuery("");
    setActiveCategoryId(null);
  }

  const visibleCategories = useMemo(
    () => filterCategories(categories, query, activeCategoryId),
    [categories, query, activeCategoryId]
  );

  const totalApps = categories.reduce((sum, category) => sum + category.links.length, 0);
  const shownApps = visibleCategories.reduce((sum, category) => sum + category.links.length, 0);

  return (
    // reducedMotion="user" turns animations off for people who've asked their OS for less motion.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <Header
            theme={theme}
            onToggleTheme={toggleTheme}
            totalApps={status === "ready" ? totalApps : null}
          />

          {status === "loading" && <LoadingView />}
          {status === "error" && <ErrorView message={error} onRetry={retry} />}
          {status === "ready" && totalApps === 0 && <NoDataView adminUrl={ADMIN_URL} />}

          {status === "ready" && totalApps > 0 && (
            <>
              <div className="mt-8 space-y-4">
                <SearchBar value={query} onChange={setQuery} />
                <CategoryFilter
                  categories={categories}
                  activeId={activeCategoryId}
                  onChange={setActiveCategoryId}
                />
              </div>

              <p className="sr-only" aria-live="polite">
                {shownApps} of {totalApps} applications shown
              </p>

              <div className="mt-10 space-y-12">
                <AnimatePresence mode="popLayout">
                  {visibleCategories.map((category) => (
                    <CategorySection key={category.id} category={category} />
                  ))}
                </AnimatePresence>
                {visibleCategories.length === 0 && (
                  <NoResultsView query={query.trim()} onClear={clearFilters} />
                )}
              </div>

              <footer className="mt-16 border-t border-slate-200 pt-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
                Missing or broken link?{" "}
                <a
                  href={ADMIN_URL}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Manage links
                </a>
              </footer>
            </>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
