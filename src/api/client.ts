const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const AUTH_STORAGE_KEY = "ecobi.auth.session";
let activeAuthSession: StoredAuthSession | null = null;

type ApiSuccess<T> = {
  success: true;
  data: T;
  message: string;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function formatApiError(error: ApiFailure["error"]) {
  const details = error.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
  const fieldMessages = details?.fieldErrors
    ? Object.values(details.fieldErrors)
        .flat()
        .filter(Boolean)
    : [];
  const formMessages = details?.formErrors?.filter(Boolean) ?? [];
  const messages = [...fieldMessages, ...formMessages];
  return messages.length ? messages.join("\n") : error.message;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const authSession = activeAuthSession ?? readStoredAuthSession();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (authSession?.userId) headers.set("X-Ecobi-User-Id", String(authSession.userId));

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!payload.success) {
    throw new Error(formatApiError(payload.error));
  }
  return payload.data;
}

export type StoredAuthSession = {
  userId: number;
  email: string | null;
  displayName: string;
  profileComplete: boolean;
};

export function readStoredAuthSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (!parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(session: StoredAuthSession) {
  activeAuthSession = session;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Some embedded browser contexts can block storage; the in-memory session still keeps the current run connected.
  }
}

export function clearStoredAuthSession() {
  activeAuthSession = null;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures in restricted preview environments.
  }
}

export function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}
