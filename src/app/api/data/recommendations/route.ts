import { NextResponse } from "next/server";
import { dataError, withDataClient } from "../_lib";
import { listRecommendedServices } from "@/lib/supabase/repository";

/** Explainable server-side ranking; no client-provided score or identity is trusted. */
export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ services: await listRecommendedServices(result.client) });
  } catch (error) { return dataError(error); }
}
