import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { listNotifications, markNotificationsRead } from "@/lib/supabase/repository";

export async function GET() {
  try { const result = await withDataClient(); if (result.response) return result.response; return NextResponse.json({ notifications: await listNotifications(result.client) }); } catch (error) { return dataError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string"))) {
      throw inputError("ids is invalid.");
    }
    return NextResponse.json({ updated: await markNotificationsRead(result.client, body.ids as string[] | undefined) });
  } catch (error) { return dataError(error); }
}
