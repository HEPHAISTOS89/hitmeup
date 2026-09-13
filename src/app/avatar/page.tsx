import { AvatarPageClient } from "@/components/avatar-page-client";

export default async function AvatarPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const previewMode = process.env.NODE_ENV !== "production" && preview === "1";
  return <AvatarPageClient preview={previewMode} />;
}
