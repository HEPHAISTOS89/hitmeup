import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../../../_lib";
import { listMessages, sendMessage } from "@/lib/supabase/repository";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  try { const result = await withDataClient(); if (result.response) return result.response; return NextResponse.json({ messages: await listMessages(result.client, (await context.params).requestId) }); } catch (error) { return dataError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.body !== "string") throw inputError("body is invalid.");
    const id = await sendMessage(result.client, (await context.params).requestId, body.body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return dataError(error); }
}
