import { NextResponse } from "next/server";
import { dataError, withDataClient } from "../../_lib";
import { listMyReceivedReviews } from "@/lib/supabase/repository";

export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ reviews: await listMyReceivedReviews(result.client) });
  } catch (error) {
    return dataError(error);
  }
}
