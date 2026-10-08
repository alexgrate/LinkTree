const API_URL = import.meta.env.VITE_API_URL;

// The Django admin lives next to the API: http://host/api -> http://host/admin/
export const ADMIN_URL = API_URL.replace(/\/api\/?$/, "/admin/");

export async function fetchCategories() {
  const res = await fetch(`${API_URL}/links/`);
  if (!res.ok) {
    throw new Error(`Failed to load links (${res.status})`);
  }
  return res.json();
}
