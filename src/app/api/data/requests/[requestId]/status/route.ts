import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../../../_lib";
import { transitionRequest } from "@/lib/supabase/repository";
import { recordTigerEvent } from "@/lib/integrations/tiger";

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.status !== "string") throw inputError("status is invalid.");
    const status = await transitionRequest(result.client, (await context.params).requestId, body.status);
    if (status === "accepted") await recordTigerEvent({ name: "request_accepted" }, result.student.sub);
    return NextResponse.json({ status });
  } catch (error) { return dataError(error); }
}
