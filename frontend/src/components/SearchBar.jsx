import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function SearchBar({ value, onChange }) {
  const inputRef = useRef(null);

  // Cmd/Ctrl+K or "/" jumps to search from anywhere on the page.
  useEffect(() => {
    function handleKeyDown(event) {
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function clear() {
    onChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            event.currentTarget.blur();
          }
        }}
        placeholder="Search apps, teams or aliases…"
        aria-label="Search applications"
        autoComplete="off"
        spellCheck="false"
        className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pr-12 pl-12 sm:pr-24 text-base text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-brand-500"
      />
      <div className="absolute top-1/2 right-3 -translate-y-1/2">
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-sans text-xs text-slate-500 sm:inline-block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        )}
      </div>
    </div>
  );
}
