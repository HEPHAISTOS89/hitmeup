import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../../../_lib";
import { submitRating } from "@/lib/supabase/repository";
import { recordTigerEvent } from "@/lib/integrations/tiger";

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (typeof body.score !== "number" || (body.comment !== undefined && typeof body.comment !== "string")) throw inputError("score/comment is invalid.");
    const id = await submitRating(result.client, (await context.params).requestId, body.score, body.comment as string | undefined);
    await recordTigerEvent({ name: "rating_submitted" }, result.student.sub);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return dataError(error); }
}
