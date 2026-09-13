export class IntegrationError extends Error {
  readonly code: "configuration" | "timeout" | "upstream" | "invalid_response";
  readonly status: number;

  constructor(
    code: IntegrationError["code"],
    message: string,
    status = code === "configuration" ? 503 : 502,
  ) {
    super(message);
    this.name = "IntegrationError";
    this.code = code;
    this.status = status;
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 8_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new IntegrationError("timeout", "Integration request timed out.", 504);
    }
    throw new IntegrationError("upstream", "Integration request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new IntegrationError(
      "upstream",
      `Integration returned HTTP ${response.status}.`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new IntegrationError("invalid_response", "Integration returned invalid JSON.");
  }
}
