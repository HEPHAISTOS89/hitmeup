import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { getRewardSummary, unlockRewardCosmetic } from "@/lib/supabase/repository";

export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ rewards: await getRewardSummary(result.client) });
  } catch (error) { return dataError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.sku !== "string") throw inputError("sku is invalid.");
    await unlockRewardCosmetic(result.client, body.sku);
    return NextResponse.json({ unlocked: body.sku, rewards: await getRewardSummary(result.client) });
  } catch (error) { return dataError(error); }
}
