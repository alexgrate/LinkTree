import { useEffect, useState } from "react";

const STORAGE_KEY = "bank-linktree-theme";

function getInitialTheme() {
  // index.html already applied the right class before React loaded.
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode, policy); the toggle still works for this visit.
    }
  }

  return { theme, toggleTheme };
}
