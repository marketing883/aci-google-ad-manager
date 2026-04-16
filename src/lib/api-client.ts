import { toast } from "sonner";

/**
 * Typed fetch wrapper. Replaces the 40+ silent `catch { }` blocks scattered
 * through the app with a single place that:
 *   - throws typed errors on non-2xx responses
 *   - optionally surfaces errors to the user via toast (default: yes for
 *     mutations, no for reads — override per-call with `toastOnError`)
 *   - parses JSON automatically unless `raw: true`
 *
 * Intent: components should never have to decide between "swallow the error
 * and show nothing" vs "write try/catch + toast everywhere". Use this.
 */

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiOptions<TBody = unknown> {
  method?: Method;
  body?: TBody;
  headers?: Record<string, string>;
  toastOnError?: boolean;
  signal?: AbortSignal;
}

function isMutation(method: Method | undefined): boolean {
  return method !== undefined && method !== "GET";
}

async function request<T, TBody = unknown>(
  url: string,
  options: ApiOptions<TBody> = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    toastOnError = isMutation(method),
    signal,
  } = options;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // response wasn't JSON — swallow parse error, keep going
      }
      const message =
        (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
          ? parsed.error
          : null) ||
        (parsed && typeof parsed === "object" && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : null) ||
        `Request failed (${res.status})`;
      throw new ApiError(message, res.status, parsed);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  } catch (err) {
    // Abort errors are not surfaced to the user — they're intentional.
    if (err instanceof DOMException && err.name === "AbortError") throw err;

    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Network error";

    if (toastOnError) {
      toast.error(message);
    }
    throw err instanceof ApiError ? err : new ApiError(message, 0, null);
  }
}

export const api = {
  get: <T>(url: string, opts?: Omit<ApiOptions, "method" | "body">) =>
    request<T>(url, { ...opts, method: "GET" }),
  post: <T, TBody = unknown>(url: string, body?: TBody, opts?: Omit<ApiOptions<TBody>, "method" | "body">) =>
    request<T, TBody>(url, { ...opts, method: "POST", body }),
  put: <T, TBody = unknown>(url: string, body?: TBody, opts?: Omit<ApiOptions<TBody>, "method" | "body">) =>
    request<T, TBody>(url, { ...opts, method: "PUT", body }),
  patch: <T, TBody = unknown>(url: string, body?: TBody, opts?: Omit<ApiOptions<TBody>, "method" | "body">) =>
    request<T, TBody>(url, { ...opts, method: "PATCH", body }),
  delete: <T>(url: string, opts?: Omit<ApiOptions, "method" | "body">) =>
    request<T>(url, { ...opts, method: "DELETE" }),
};
