import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { createService, listServices } from "@/lib/supabase/repository";
import type { ListingKind } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    const params = new URL(request.url).searchParams;
    const number = (name: string) => {
      const value = params.get(name);
      if (value === null || value === "") return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw inputError(`${name} is invalid.`);
      return parsed;
    };
    return NextResponse.json({ services: await listServices(result.client, {
      category: params.get("category") ?? undefined,
      query: params.get("q") ?? undefined,
      minRating: number("minRating"),
      maxDistanceMiles: number("maxDistanceMiles"),
      listingKind: (params.get("listingKind") ?? undefined) as ListingKind | undefined,
      subcategory: params.get("subcategory") ?? undefined,
    }) });
  } catch (error) { return dataError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    return NextResponse.json({ id: await createService(result.client, body as never) }, { status: 201 });
  } catch (error) { return dataError(error); }
}
