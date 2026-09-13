type PreviewEnvironment = {
  nodeEnv?: string;
  vercelEnv?: string;
};

export function isFixturePreviewEnabled(
  requested: string | undefined,
  environment: PreviewEnvironment,
): boolean {
  if (requested !== "1") return false;

  if (environment.vercelEnv) {
    return environment.vercelEnv !== "production";
  }

  return environment.nodeEnv !== "production";
}
