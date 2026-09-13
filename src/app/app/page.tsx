import { AppGate } from "@/components/app-gate";
import { isFixturePreviewEnabled } from "@/lib/preview-mode";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ preview?: string; view?: string }> }) {
  const params = await searchParams;
  const preview = isFixturePreviewEnabled(params.preview, {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
  return <AppGate preview={preview} initialView={params.view === "profile" ? "profile" : undefined} />;
}
