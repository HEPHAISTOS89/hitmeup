import { Auth0Client } from "@auth0/nextjs-auth0/server";
import type { User } from "@auth0/nextjs-auth0/types";

export type VerifiedStudent = {
  sub: string;
  email: string;
  eduDomain: string;
};

export type AuthResult =
  | { ok: true; student: VerifiedStudent }
  | { ok: false; status: 401 | 403 | 503; code: "unauthenticated" | "unverified_student" | "auth_configuration" };

let client: Auth0Client | undefined;

export function microsoftConnectionName() {
  return process.env.AUTH0_MICROSOFT_CONNECTION?.trim() || "ttu-development";
}

const SESSION_USER_CLAIMS = new Set([
  "sub",
  "email",
  "email_verified",
  "https://hitmeup.tech/role",
  "https://hitmeup.tech/edu_domain",
  "https://hitmeup.tech/connection_strategy",
  "https://hitmeup.tech/tid",
]);

export function sanitizeSessionUser(user: User & Record<string, unknown>): User {
  return Object.fromEntries(
    Object.entries(user).filter(([key]) => SESSION_USER_CLAIMS.has(key)),
  ) as User;
}

function getClient() {
  if (client) return client;
  if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_CLIENT_SECRET || !process.env.AUTH0_SECRET || !process.env.APP_BASE_URL) {
    return null;
  }
  try {
    client = new Auth0Client({
      // HitMeUp is a Microsoft university app. Route straight to the verified
      // Entra connection instead of exposing unrelated Auth0 database/Google
      // choices that the post-login student gate would reject anyway.
      authorizationParameters: {
        connection: microsoftConnectionName(),
      },
      // SDK v4 keeps only its default profile claims unless this hook is set.
      // Persist only the namespaced Action claims required by the student gate,
      // while discarding display data and every unrelated claim from the cookie.
      beforeSessionSaved: async (session) => ({
        ...session,
        user: sanitizeSessionUser(session.user as User & Record<string, unknown>),
      }),
    });
    return client;
  } catch {
    return null;
  }
}

function allowedDomains() {
  return (process.env.ALLOWED_EDU_DOMAINS ?? "ttu.edu")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function isVerifiedStudent(user: Pick<User, "sub" | "email" | "email_verified">): VerifiedStudent | null {
  const email = user.email?.trim().toLowerCase();
  if (!user.sub || !email || user.email_verified !== true) return null;
  const at = email.lastIndexOf("@");
  const domain = at > 0 ? email.slice(at + 1) : "";
  if (!domain.endsWith(".edu") || !allowedDomains().includes(domain)) return null;
  return { sub: user.sub, email, eduDomain: domain };
}

export function verifiedStudentFromSessionClaims(user: User & Record<string, unknown>): VerifiedStudent | null {
  const role = user.role ?? user["https://hitmeup.tech/role"];
  if (role !== "authenticated") return null;
  const student = isVerifiedStudent(user);
  if (!student) return null;
  const configuredTenant = process.env.AUTH0_MICROSOFT_TID?.trim();
  const tenant = user.tid ?? user["https://hitmeup.tech/tid"];
  if (configuredTenant && tenant !== configuredTenant) return null;
  const claimedDomain = user.edu_domain ?? user["https://hitmeup.tech/edu_domain"];
  if (claimedDomain !== undefined && String(claimedDomain).toLowerCase() !== student.eduDomain) return null;
  const strategy = user.connection_strategy ?? user["https://hitmeup.tech/connection_strategy"];
  const allowedStrategies = (process.env.AUTH0_MICROSOFT_STRATEGIES ?? "waad,windowslive")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (typeof strategy !== "string" || !allowedStrategies.includes(strategy)) return null;
  return student;
}

export async function requireVerifiedStudent(): Promise<AuthResult> {
  const auth0 = getClient();
  if (!auth0) return { ok: false, status: 503, code: "auth_configuration" };
  let session;
  try {
    session = await auth0.getSession();
  } catch {
    return { ok: false, status: 401, code: "unauthenticated" };
  }
  if (!session?.user) return { ok: false, status: 401, code: "unauthenticated" };
  const student = verifiedStudentFromSessionClaims(session.user as typeof session.user & Record<string, unknown>);
  if (!student) {
    const user = session.user as typeof session.user & Record<string, unknown>;
    const role = user.role ?? user["https://hitmeup.tech/role"];
    const tenant = user.tid ?? user["https://hitmeup.tech/tid"];
    const strategy = user.connection_strategy ?? user["https://hitmeup.tech/connection_strategy"];
    const configuredTenant = process.env.AUTH0_MICROSOFT_TID?.trim();
    const allowedStrategies = (process.env.AUTH0_MICROSOFT_STRATEGIES ?? "waad,windowslive")
      .split(",").map((value) => value.trim()).filter(Boolean);
    console.warn("Auth0 session claims failed the HitMeUp student gate", {
      hasSubject: typeof user.sub === "string" && user.sub.length > 0,
      hasEmail: typeof user.email === "string" && user.email.length > 0,
      emailVerified: user.email_verified === true,
      roleAccepted: role === "authenticated",
      tenantAccepted: !configuredTenant || tenant === configuredTenant,
      strategyAccepted: typeof strategy === "string" && allowedStrategies.includes(strategy),
    });
  }
  return student
    ? { ok: true, student }
    : { ok: false, status: 403, code: "unverified_student" };
}

export const auth0 = getClient;
