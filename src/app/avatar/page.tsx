import { LegacyAvatarStudio } from "@/components/legacy-avatar-studio";

export default async function AvatarPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  return <main className="avatar-editor-page">
    <header><a href={preview === "1" ? "/app?preview=1#profile" : "/app#profile"}>← Back to profile</a><h1>Your avatar</h1></header>
    <LegacyAvatarStudio />
  </main>;
}
