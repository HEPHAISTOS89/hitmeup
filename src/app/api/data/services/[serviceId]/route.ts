import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, withDataClient } from "../../_lib";
import { deactivateService, replaceService } from "@/lib/supabase/repository";

type Context = { params: Promise<{ serviceId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    await replaceService(result.client, (await context.params).serviceId, body as never);
    return NextResponse.json({ updated: true });
  } catch (error) { return dataError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    await deactivateService(result.client, (await context.params).serviceId);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return dataError(error); }
}
