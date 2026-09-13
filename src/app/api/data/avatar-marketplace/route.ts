import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { listAvatarMarketplace, setAvatarCosmetic } from "@/lib/supabase/repository";

export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ items: await listAvatarMarketplace(result.client) });
  } catch (error) { return dataError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.sku !== "string") throw inputError("sku is invalid.");
    if (body.equipped !== undefined && typeof body.equipped !== "boolean") throw inputError("equipped is invalid.");
    const equipped = body.equipped !== false;
    await setAvatarCosmetic(result.client, body.sku, equipped);
    return NextResponse.json({ sku: body.sku, equipped });
  } catch (error) { return dataError(error); }
}
