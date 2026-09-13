import { AvatarPageClient } from "@/components/avatar-page-client";
import { isFixturePreviewEnabled } from "@/lib/preview-mode";

export default async function AvatarPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const previewMode = isFixturePreviewEnabled(preview, {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
  return <AvatarPageClient preview={previewMode} />;
}
