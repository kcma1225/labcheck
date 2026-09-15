export interface ApiError extends Error {
  status: number;
}

const BASE = "/api";

async function request(method: string, path: string, body?: unknown, form?: FormData): Promise<any> {
  const init: RequestInit = { method, credentials: "include", headers: {} };
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const res = await fetch(BASE + path, init);
  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || "Request failed") as ApiError;
    err.status = res.status;
    throw err;
  }
  return data;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body?: unknown) => request("POST", path, body),
  patch: (path: string, body?: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
  upload: (path: string, form: FormData) => request("POST", path, undefined, form),
};

/** Build the authenticated download URL for a file resource. */
export function fileUrl(workspaceId: string, resourceId: string): string {
  return `${BASE}/workspaces/${workspaceId}/files/${resourceId}`;
}
