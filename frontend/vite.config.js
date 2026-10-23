import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development, Vite forwards API and Django admin requests to the Django dev server,
// so the browser sees one site, just like production behind IIS. The console's sign-in
// cookie only works that way. changeOrigin stays off so Django sees the browser's own
// host (localhost:5173) and its CSRF origin check passes.
const DJANGO = { target: "http://127.0.0.1:8000", changeOrigin: false };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // A regex, not "/admin": app pages such as /admins and /admin-roles stay with Vite.
      "^/(api|admin|static)(/|$)": DJANGO,
    },
  },
});
