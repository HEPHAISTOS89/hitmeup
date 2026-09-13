import { NextResponse } from "next/server";
import { assertSameOriginMutation, dataError, withDataClient } from "../../../_lib";
import { confirmCompletion } from "@/lib/supabase/repository";
import { recordTigerEvent } from "@/lib/integrations/tiger";

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const complete = await confirmCompletion(result.client, (await context.params).requestId);
    if (complete) await recordTigerEvent({ name: "service_completed" }, result.student.sub);
    return NextResponse.json({ complete });
  } catch (error) { return dataError(error); }
}
