import { AppWindow } from "lucide-react";
import { ICONS } from "../lib/icons";

// Renders the icon whose name was typed in the Django admin (e.g. "landmark").
// Unknown or empty names fall back to a generic icon instead of rendering nothing.
export default function AppIcon({ name, fallback = AppWindow, className }) {
  const Icon = ICONS[name?.trim().toLowerCase()] ?? fallback;
  return <Icon className={className} aria-hidden="true" />;
}
