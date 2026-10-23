const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(status, body) {
    super(messageFrom(status, body));
    this.status = status;
    // Field errors from Django REST Framework: { email: ["Enter a valid email address."] }
    this.fields = body && typeof body === "object" && !body.detail ? body : {};
  }
}

function messageFrom(status, body) {
  if (status === 429) return "Too many failed sign-ins from this network. Try again in 30 minutes.";
  if (body?.detail) return body.detail;
  if (body && typeof body === "object") {
    const [field, errors] = Object.entries(body)[0] ?? [];
    if (field) return `${field === "non_field_errors" ? "" : `${field}: `}${[errors].flat()[0]}`;
  }
  if (status >= 500) return "The server had a problem. Try again, or check the service logs.";
  return `Request failed (${status})`;
}

function csrfToken() {
  return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
}

export async function api(path, { method = "GET", body, params } = {}) {
  let url = `${API_URL}${path}`;
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );
    if (query.size) url += `?${query}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(method !== "GET" && { "X-CSRFToken": csrfToken() }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { detail: "Can't reach the server. Check your connection." });
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path, params) => api(path, { params });
export const post = (path, body = {}) => api(path, { method: "POST", body });
export const patch = (path, body) => api(path, { method: "PATCH", body });
export const del = (path) => api(path, { method: "DELETE" });
