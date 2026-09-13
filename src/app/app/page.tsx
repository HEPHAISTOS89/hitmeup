import { AppGate } from "@/components/app-gate";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const params = await searchParams;
  const preview = process.env.NODE_ENV !== "production" && params.preview === "1";
  return <AppGate preview={preview} />;
}
