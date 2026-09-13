/**
 * Auth0 Post Login Action.
 * Secrets/config: ALLOWED_EDU_DOMAINS may contain a comma-separated allowlist.
 */
exports.onExecutePostLogin = async (event, api) => {
  const strategy = event.connection?.strategy;
  const microsoftStrategies = (event.secrets.MICROSOFT_CONNECTION_STRATEGIES ?? "waad,windowslive")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!strategy || !microsoftStrategies.includes(strategy)) {
    api.access.deny("Use the approved Microsoft university sign-in.");
    return;
  }
  const email = event.user.email?.trim().toLowerCase();
  if (!event.user.email_verified || !email) {
    api.access.deny("A verified student email is required.");
    return;
  }

  const domain = email.split("@").at(-1);
  const configured = event.secrets.ALLOWED_EDU_DOMAINS ?? "ttu.edu";
  const allowedDomains = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!domain || !domain.endsWith(".edu") || !allowedDomains.includes(domain)) {
    api.access.deny("HitMeUp is available only to approved university domains.");
    return;
  }

  const expectedTenant = event.secrets.MICROSOFT_TENANT_ID?.trim();
  // Auth0's Microsoft Entra v2 profile exposes the directory as `tenantid`
  // on the normalized user. Older/custom connections may still expose `tid`.
  const microsoftIdentity = event.user.identities?.find((identity) =>
    identity.profileData?.tenantid || identity.profileData?.tid,
  );
  const tenant = event.user.tenantid ?? event.user.tid
    ?? event.user.app_metadata?.tid ?? event.user.user_metadata?.tid
    ?? microsoftIdentity?.profileData?.tenantid ?? microsoftIdentity?.profileData?.tid;
  if (expectedTenant && tenant !== expectedTenant) {
    api.access.deny("Your Microsoft university tenant is not approved.");
    return;
  }

  api.idToken.setCustomClaim("role", "authenticated");
  api.idToken.setCustomClaim("https://hitmeup.tech/role", "authenticated");
  api.idToken.setCustomClaim("edu_domain", domain);
  api.idToken.setCustomClaim("https://hitmeup.tech/edu_domain", domain);
  api.idToken.setCustomClaim("connection_strategy", strategy);
  api.idToken.setCustomClaim("https://hitmeup.tech/connection_strategy", strategy);
  if (tenant) {
    api.idToken.setCustomClaim("tid", tenant);
    api.idToken.setCustomClaim("https://hitmeup.tech/tid", tenant);
  }
};
