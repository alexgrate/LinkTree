import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AnimatePresence } from "motion/react";
import { Settings2 } from "lucide-react";
import { get } from "../api";
import { useSession } from "../lib";
import { filterCategories } from "../../lib/search";
import SearchBar from "../../components/SearchBar";
import CategoryFilter from "../../components/CategoryFilter";
import CategorySection from "../../components/CategorySection";
import { ErrorView, LoadingView, NoDataView, NoResultsView } from "../../components/StatusViews";
import { PageHeader } from "../components/ui";

// The app directory: every internal application, for all staff. No sign-in needed.
export default function ApplicationsPage() {
  const user = useSession();
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  // Shares the "links" key with the management page, so edits there show up here at once.
  const directory = useQuery({ queryKey: ["links", "public"], queryFn: () => get("/links/") });
  const categories = useMemo(() => directory.data ?? [], [directory.data]);

  const visibleCategories = useMemo(
    () => filterCategories(categories, query, activeCategoryId),
    [categories, query, activeCategoryId]
  );

  const totalApps = categories.reduce((sum, category) => sum + category.links.length, 0);
  const shownApps = visibleCategories.reduce((sum, category) => sum + category.links.length, 0);

  function clearFilters() {
    setQuery("");
    setActiveCategoryId(null);
  }

  return (
    <>
      <PageHeader
        title="Applications"
        description={
          directory.isSuccess
            ? `${totalApps} internal ${totalApps === 1 ? "application" : "applications"} in one place`
            : "Every internal application in one place"
        }
        actions={
          user && (
            <Link
              to="/directory"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              <Settings2 className="size-4" aria-hidden="true" /> Manage links
            </Link>
          )
        }
      />

      {directory.isPending && <LoadingView />}
      {directory.isError && <ErrorView message={directory.error.message} onRetry={directory.refetch} />}
      {directory.isSuccess && totalApps === 0 && <NoDataView canManage={Boolean(user)} />}

      {directory.isSuccess && totalApps > 0 && (
        <>
          <div className="space-y-4">
            <SearchBar value={query} onChange={setQuery} />
            <CategoryFilter categories={categories} activeId={activeCategoryId} onChange={setActiveCategoryId} />
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
            {visibleCategories.length === 0 && <NoResultsView query={query.trim()} onClear={clearFilters} />}
          </div>
        </>
      )}
    </>
  );
}
