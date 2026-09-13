import { IntegrationError } from "./integrations/http";

const origins = () => (process.env.ALLOWED_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
  .split(",").map((value) => value.trim()).filter(Boolean);

/** Same-site browsers send Origin; bearer clients may omit it. Unknown origins are rejected. */
export function assertSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !origins().includes(origin)) throw new IntegrationError("invalid_response", "Cross-origin mutation denied.", 403);
  if (process.env.NODE_ENV === "production" && !origin && request.headers.get("sec-fetch-site") !== "same-origin") throw new IntegrationError("invalid_response", "Mutation origin could not be verified.", 403);
}
