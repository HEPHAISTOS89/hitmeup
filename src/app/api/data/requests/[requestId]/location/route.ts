import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../../../_lib";
import { getSharedLocation, revokeLocation, shareLocation } from "@/lib/supabase/repository";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  try { const result = await withDataClient(); if (result.response) return result.response; return NextResponse.json(await getSharedLocation(result.client, (await context.params).requestId)); } catch (error) { return dataError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try { assertSameOriginMutation(request); const result = await withDataClient(); if (result.response) return result.response; const body = await bodyObject(request); if (body.expiresAt !== undefined && typeof body.expiresAt !== "string") throw inputError("expiresAt is invalid."); return NextResponse.json(await shareLocation(result.client, (await context.params).requestId, body.expiresAt as string | undefined)); } catch (error) { return dataError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try { assertSameOriginMutation(request); const result = await withDataClient(); if (result.response) return result.response; return NextResponse.json(await revokeLocation(result.client, (await context.params).requestId)); } catch (error) { return dataError(error); }
}
