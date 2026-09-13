import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { equipCosmetic, listCosmetics } from "@/lib/supabase/repository";

export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ cosmetics: await listCosmetics(result.client) });
  } catch (error) { return dataError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.sku !== "string") throw inputError("sku is invalid.");
    await equipCosmetic(result.client, body.sku);
    return NextResponse.json({ equipped: body.sku });
  } catch (error) { return dataError(error); }
}
