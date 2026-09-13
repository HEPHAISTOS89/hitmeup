import { NextResponse } from "next/server";
import { assertSameOriginMutation, bodyObject, dataError, inputError, withDataClient } from "../_lib";
import { getMyProfile, updateProfile } from "@/lib/supabase/repository";
import type { AvatarConfig } from "@/lib/types";

export async function GET() {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    return NextResponse.json({ profile: await getMyProfile(result.client) });
  } catch (error) { return dataError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await withDataClient();
    if (result.response) return result.response;
    const body = await bodyObject(request);
    if (body.solanaWallet !== undefined) throw inputError("Use the signed wallet-link flow.");
    for (const key of ["displayName", "avatarUrl", "bio"] as const) {
      if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "string") throw inputError(`${key} is invalid.`);
    }
    if (body.interests !== undefined && (!Array.isArray(body.interests) || body.interests.some((value) => typeof value !== "string"))) {
      throw inputError("interests is invalid.");
    }
    if (body.avatarConfig !== undefined && (!body.avatarConfig || typeof body.avatarConfig !== "object" || Array.isArray(body.avatarConfig))) {
      throw inputError("avatarConfig is invalid.");
    }
    return NextResponse.json({ updated: await updateProfile(result.client, {
      displayName: body.displayName as string | undefined,
      avatarUrl: body.avatarUrl as string | null | undefined,
      bio: body.bio as string | null | undefined,
      interests: body.interests as string[] | undefined,
      avatarConfig: body.avatarConfig as AvatarConfig | undefined,
    }) });
  } catch (error) { return dataError(error); }
}
