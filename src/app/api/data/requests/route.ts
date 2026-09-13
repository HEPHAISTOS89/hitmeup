import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { createRequest, listRequests } from "@/lib/supabase/repository";
import { recordTigerEvent } from "@/lib/integrations/tiger";

export async function GET() {
  try { const result = await withDataClient(); if (result.response) return result.response; return NextResponse.json({ requests: await listRequests(result.client) }); } catch (error) { return dataError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.serviceId !== "string") throw inputError("serviceId is invalid.");
    const id = await createRequest(result.client, { serviceId: body.serviceId });
    await recordTigerEvent({ name: "request_sent", serviceId: body.serviceId }, result.student.sub);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return dataError(error); }
}
