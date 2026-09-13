import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvatarConfig, AvatarMarketplaceProjection, ListingKind, RewardSummary } from "../types";
import { isServiceCategory, subcategoriesFor } from "../service-taxonomy";

export class DataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataValidationError";
  }
}

export type ServiceInput = {
  category: string;
  subcategory?: string;
  title: string;
  description: string;
  priceNote: string;
  availabilityNote: string;
  scheduledFor?: string | null;
  exactPoint: { latitude: number; longitude: number };
};

export type ServiceFilters = {
  category?: string;
  query?: string;
  minRating?: number;
  maxDistanceMiles?: number;
  listingKind?: ListingKind;
  subcategory?: string;
};

export type ServiceRequestInput = { serviceId: string };

export type ProfileInput = {
  userId: string;
  email: string;
  eduDomain: string;
  displayName: string;
};

export type ProfileUpdateInput = {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  solanaWallet?: string | null;
  interests?: string[];
  avatarConfig?: AvatarConfig;
};

const AVATAR_VALUES = {
  skin: new Set(["porcelain", "sand", "golden", "umber", "cocoa", "ebony"]),
  face: new Set(["smile", "focused", "wink"]),
  hair: new Set(["crop", "curls", "locs", "bob"]),
  hairColor: new Set(["ink", "chestnut", "auburn", "violet"]),
  outfit: new Set(["tee", "hoodie", "tech"]),
  accessory: new Set(["none", "glasses", "headphones"]),
} as const;

export function validatedAvatarConfig(value: unknown): AvatarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataValidationError("avatarConfig is invalid.");
  const input = value as Record<string, unknown>;
  const keys = Object.keys(AVATAR_VALUES);
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input))) throw new DataValidationError("avatarConfig is invalid.");
  for (const key of keys as Array<keyof AvatarConfig>) {
    if (typeof input[key] !== "string" || !AVATAR_VALUES[key].has(input[key] as never)) throw new DataValidationError("avatarConfig is invalid.");
  }
  return {
    skin: input.skin as AvatarConfig["skin"],
    face: input.face as AvatarConfig["face"],
    hair: input.hair as AvatarConfig["hair"],
    hairColor: input.hairColor as AvatarConfig["hairColor"],
    outfit: input.outfit as AvatarConfig["outfit"],
    accessory: input.accessory as AvatarConfig["accessory"],
  };
}

function requiredText(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== "string") throw new DataValidationError(`${name} is invalid.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new DataValidationError(`${name} is invalid.`);
  return clean;
}

function point(value: { latitude: number; longitude: number }, name: string) {
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) throw new DataValidationError(`${name} is invalid.`);
  return `SRID=4326;POINT(${value.longitude} ${value.latitude})`;
}

function assertUuid(value: string, name: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new DataValidationError(`${name} is invalid.`);
}

function httpsUrl(value: string, name: string, max: number) {
  const clean = requiredText(value, name, max);
  try {
    if (new URL(clean).protocol !== "https:") throw new Error();
  } catch {
    throw new DataValidationError(`${name} is invalid.`);
  }
  return clean;
}

async function unwrap<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

type PublicServiceRow = {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  description: string;
  price_note: string;
  availability_note: string;
  scheduled_for: string | null;
  approximate_lat: number;
  approximate_lng: number;
  approximate_distance_miles: number;
  provider_name: string;
  provider_initials: string;
  provider_verified: boolean;
  provider_rating: number | string;
  provider_rating_count: number;
  provider_completed: number;
  service_type: string;
  sponsored: boolean;
};

function mapPublicService(row: PublicServiceRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    priceNote: row.price_note,
    availability: row.availability_note,
    scheduledFor: row.scheduled_for,
    approximatePosition: [Number(row.approximate_lat), Number(row.approximate_lng)] as [number, number],
    distanceMiles: Number(Number(row.approximate_distance_miles).toFixed(1)),
    type: row.service_type,
    sponsored: row.sponsored,
    provider: {
      name: row.provider_name,
      initials: row.provider_initials,
      verified: row.provider_verified,
      rating: Number(row.provider_rating),
      ratingCount: row.provider_rating_count,
      completed: row.provider_completed,
    },
  };
}

function optionalNumber(value: number | undefined, name: string, min: number, max: number) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < min || value > max) throw new DataValidationError(`${name} is invalid.`);
  return value;
}

export async function listServices(client: SupabaseClient, filters: ServiceFilters = {}) {
  const category = filters.category ? requiredText(filters.category, "category", 80) : undefined;
  const query = filters.query ? requiredText(filters.query, "query", 120) : undefined;
  const minRating = optionalNumber(filters.minRating, "minRating", 0, 5);
  const maxDistanceMiles = optionalNumber(filters.maxDistanceMiles, "maxDistanceMiles", 0, 50);
  const listingKind = filters.listingKind;
  if (listingKind !== undefined && !["temporary", "permanent"].includes(listingKind)) {
    throw new DataValidationError("listingKind is invalid.");
  }
  const subcategory = filters.subcategory ? requiredText(filters.subcategory, "subcategory", 80) : undefined;
  const rows = await unwrap<PublicServiceRow[]>(client.rpc("list_public_marketplace_services", {
    target_category: category ?? null,
    target_query: query ?? null,
    target_min_rating: minRating ?? null,
    target_max_distance_miles: maxDistanceMiles ?? null,
    target_listing_kind: listingKind ?? null,
    target_subcategory: subcategory ?? null,
  }));
  return (rows ?? []).map(mapPublicService);
}

export async function ensureProfile(client: SupabaseClient, input: ProfileInput) {
  return unwrap(client.rpc("ensure_profile", {
    target_user_id: requiredText(input.userId, "userId", 160),
    target_email: requiredText(input.email, "email", 320).toLowerCase(),
    target_edu_domain: requiredText(input.eduDomain, "eduDomain", 255).toLowerCase(),
    target_display_name: requiredText(input.displayName, "displayName", 60),
  }));
}

export async function linkVerifiedProfileWallet(client: SupabaseClient, userId: string, wallet: string) {
  const cleanUserId = requiredText(userId, "userId", 160);
  const cleanWallet = requiredText(wallet, "wallet", 44);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanWallet)) throw new DataValidationError("wallet is invalid.");
  const { error } = await client.from("profiles").update({ solana_wallet: cleanWallet, updated_at: new Date().toISOString() }).eq("user_id", cleanUserId);
  if (error) throw new Error(error.message);
  return true;
}

export async function getProfileWallet(client: SupabaseClient, userId: string) {
  const cleanUserId = requiredText(userId, "userId", 160);
  const { data, error } = await client.from("profiles").select("solana_wallet").eq("user_id", cleanUserId).maybeSingle();
  if (error) throw new Error(error.message);
  const wallet = data?.solana_wallet;
  if (typeof wallet !== "string" || !wallet) throw new DataValidationError("A linked Solana wallet is required.");
  return wallet;
}

export async function updateProfile(client: SupabaseClient, input: ProfileUpdateInput) {
  const payload: Record<string, string | string[] | AvatarConfig | null> = {};
  if (input.displayName !== undefined) payload.displayName = requiredText(input.displayName, "displayName", 60);
  if (input.avatarUrl !== undefined) payload.avatarUrl = input.avatarUrl === null ? null : httpsUrl(input.avatarUrl, "avatarUrl", 500);
  if (input.bio !== undefined) payload.bio = input.bio === null ? null : requiredText(input.bio, "bio", 320);
  if (input.solanaWallet !== undefined) throw new DataValidationError("Use the signed wallet-link flow.");
  if (input.interests !== undefined) {
    if (!Array.isArray(input.interests) || input.interests.length > 20) throw new DataValidationError("interests is invalid.");
    payload.interests = input.interests.map((value) => requiredText(value, "interest", 50));
  }
  if (input.avatarConfig !== undefined) payload.avatarConfig = validatedAvatarConfig(input.avatarConfig);
  if (Object.keys(payload).length === 0) throw new DataValidationError("At least one profile field is required.");
  return unwrap(client.rpc("update_my_profile_without_wallet", {
    set_display_name: input.displayName !== undefined,
    target_display_name: payload.displayName ?? null,
    set_avatar_url: input.avatarUrl !== undefined,
    target_avatar_url: payload.avatarUrl ?? null,
    set_bio: input.bio !== undefined,
    target_bio: payload.bio ?? null,
    set_interests: input.interests !== undefined,
    target_interests: payload.interests ?? null,
    set_avatar_config: input.avatarConfig !== undefined,
    target_avatar_config: payload.avatarConfig ?? null,
  }));
}

function serviceRpcBody(input: ServiceInput) {
  if (input.scheduledFor !== undefined && input.scheduledFor !== null && typeof input.scheduledFor !== "string") {
    throw new DataValidationError("scheduledFor is invalid.");
  }
  const scheduledFor = input.scheduledFor == null ? null : new Date(input.scheduledFor);
  if (scheduledFor && Number.isNaN(scheduledFor.valueOf())) throw new DataValidationError("scheduledFor is invalid.");
  const category = requiredText(input.category, "category", 80);
  const legacySubcategory: Record<string, string> = {
    "Tech help": "Tech help",
    Ride: "Quick ride",
    Creative: "Photography",
    Moving: "Moving help",
    Other: "Other request",
  };
  const legacy = category in legacySubcategory;
  if (!isServiceCategory(category) && !legacy) {
    throw new DataValidationError("category is invalid.");
  }
  if (category === "Businesses") throw new DataValidationError("Business listings require the reviewed sponsorship workflow.");
  const subcategory = input.subcategory === undefined
    ? legacySubcategory[category] ?? (isServiceCategory(category) ? subcategoriesFor(category)[0].label : null)
    : requiredText(input.subcategory, "subcategory", 80);
  if (isServiceCategory(category) && subcategory && !subcategoriesFor(category).some((item) => item.label === subcategory)) {
    throw new DataValidationError("subcategory is invalid.");
  }
  if (legacy && subcategory !== legacySubcategory[category]) {
    throw new DataValidationError("subcategory is invalid.");
  }
  return {
    service_category: category,
    service_subcategory: subcategory,
    service_title: requiredText(input.title, "title", 90, 4),
    service_description: requiredText(input.description, "description", 600, 10),
    service_price_note: requiredText(input.priceNote, "priceNote", 80),
    service_availability_note: requiredText(input.availabilityNote, "availabilityNote", 120),
    service_scheduled_for: scheduledFor?.toISOString() ?? null,
    exact_wkt: point(input.exactPoint, "exactPoint"),
  };
}

export async function createService(client: SupabaseClient, input: ServiceInput) {
  return unwrap(client.rpc("create_service", serviceRpcBody(input)));
}

export async function replaceService(client: SupabaseClient, serviceId: string, input: ServiceInput) {
  assertUuid(serviceId, "serviceId");
  return unwrap(client.rpc("replace_service", { target_service_id: serviceId, ...serviceRpcBody(input) }));
}

export async function deactivateService(client: SupabaseClient, serviceId: string) {
  assertUuid(serviceId, "serviceId");
  return unwrap(client.rpc("deactivate_service", { target_service_id: serviceId }));
}

export async function listRequests(client: SupabaseClient) {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("list_my_service_requests"));
  return (rows ?? []).map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    status: row.status,
    role: row.viewer_role,
    otherParty: { name: row.other_party_name, initials: row.other_party_initials },
    service: { title: row.service_title, category: row.service_category },
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    closedAt: row.closed_at,
    completion: { mine: row.my_completion, theirs: row.other_completion },
    ratings: { mine: row.my_rating, theirs: row.other_rating },
    location: {
      mine: row.my_location_shared,
      theirs: row.other_location_shared,
      expiresAt: row.location_expires_at,
    },
  }));
}

export async function createRequest(client: SupabaseClient, input: ServiceRequestInput) {
  assertUuid(input.serviceId, "serviceId");
  return unwrap(client.rpc("create_service_request", { target_service_id: input.serviceId }));
}

export async function transitionRequest(client: SupabaseClient, requestId: string, nextStatus: string) {
  assertUuid(requestId, "requestId");
  if (!["accepted", "meeting", "rejected", "cancelled"].includes(nextStatus)) throw new DataValidationError("Unsupported request transition.");
  return unwrap(client.rpc("transition_service_request", { target_request_id: requestId, next_status: nextStatus }));
}

export async function listMessages(client: SupabaseClient, requestId: string) {
  assertUuid(requestId, "requestId");
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("list_request_messages", { target_request_id: requestId }));
  return (rows ?? []).map((row) => ({
    id: row.id,
    requestId: row.request_id,
    body: row.body,
    createdAt: row.created_at,
    isMine: row.is_mine,
    senderName: row.sender_name,
  }));
}

export async function sendMessage(client: SupabaseClient, requestId: string, body: string) {
  assertUuid(requestId, "requestId");
  return unwrap(client.rpc("send_request_message", { target_request_id: requestId, message_body: requiredText(body, "body", 2_000) }));
}

export async function shareLocation(client: SupabaseClient, requestId: string, expiresAt?: string) {
  assertUuid(requestId, "requestId");
  const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 60 * 60 * 1_000);
  if (Number.isNaN(expiry.valueOf()) || expiry <= new Date()) throw new DataValidationError("expiresAt is invalid.");
  return unwrap(client.rpc("share_request_location", { target_request_id: requestId, target_expires_at: expiry.toISOString() }));
}

export async function revokeLocation(client: SupabaseClient, requestId: string) {
  assertUuid(requestId, "requestId");
  return unwrap(client.rpc("revoke_request_location", { target_request_id: requestId }));
}

export async function getSharedLocation(client: SupabaseClient, requestId: string) {
  assertUuid(requestId, "requestId");
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("get_shared_request_location", { target_request_id: requestId }));
  const row = rows?.[0];
  return row ? { serviceId: row.service_id, exactPoint: row.exact_point, expiresAt: row.expires_at } : null;
}

export async function confirmCompletion(client: SupabaseClient, requestId: string) {
  assertUuid(requestId, "requestId");
  return unwrap(client.rpc("confirm_request_completion", { target_request_id: requestId }));
}

export async function submitRating(client: SupabaseClient, requestId: string, score: number, comment?: string) {
  assertUuid(requestId, "requestId");
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new DataValidationError("score must be an integer between 1 and 5.");
  if (comment !== undefined && (typeof comment !== "string" || comment.length > 500)) throw new DataValidationError("comment is invalid.");
  return unwrap(client.rpc("submit_request_rating", { target_request_id: requestId, target_score: score, target_comment: comment?.trim() || null }));
}

export async function listNotifications(client: SupabaseClient) {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("list_my_notifications"));
  return (rows ?? []).map((row) => ({ id: row.id, type: row.type, payload: row.payload, readAt: row.read_at, createdAt: row.created_at }));
}

export async function markNotificationsRead(client: SupabaseClient, ids?: string[]) {
  if (ids && (ids.length > 100 || ids.some((id) => { try { assertUuid(id, "notificationId"); return false; } catch { return true; } }))) {
    throw new DataValidationError("notificationIds is invalid.");
  }
  return unwrap(client.rpc("mark_my_notifications_read", { target_ids: ids ?? null }));
}

export async function claimCosmeticUnlock(client: SupabaseClient, userId: string, sku: string, signature: string, wallet: string, lamports: number, quoteId: string) {
  const cleanUserId = requiredText(userId, "userId", 160);
  const cleanSku = requiredText(sku, "sku", 80);
  const cleanSignature = requiredText(signature, "signature", 100);
  const cleanWallet = requiredText(wallet, "wallet", 44);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new DataValidationError("lamports is invalid.");
  assertUuid(quoteId, "quoteId");
  return unwrap(client.rpc("claim_profile_customization", {
    target_user_id: cleanUserId,
    target_sku: cleanSku,
    target_signature: cleanSignature,
    target_wallet: cleanWallet,
    target_lamports: lamports,
    target_quote_id: quoteId,
  }));
}

export async function reserveCosmeticQuote(client: SupabaseClient, userId: string, sku: string, lamports: number, clientKey: string) {
  if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new DataValidationError("lamports is invalid.");
  assertUuid(clientKey, "clientKey");
  return unwrap<string>(client.rpc("reserve_profile_purchase_quote", {
    target_user_id: requiredText(userId, "userId", 160),
    target_sku: requiredText(sku, "sku", 80),
    target_lamports: lamports,
    target_client_key: clientKey,
  }));
}

export async function getSolanaProductState(client: SupabaseClient, sku: string) {
  const cleanSku = requiredText(sku, "sku", 80);
  const { data, error } = await client.from("avatar_solana_products").select("sku,lamports,active").eq("sku", cleanSku).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.active !== true) return null;
  return { sku: data.sku, lamports: Number(data.lamports) };
}

export async function hasPaidCosmeticOwnership(client: SupabaseClient, userId: string, sku: string) {
  const { data, error } = await client.from("profile_purchase_entitlements").select("purchase_sku")
    .eq("user_id", requiredText(userId, "userId", 160)).eq("purchase_sku", requiredText(sku, "sku", 80)).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function listAvatarMarketplace(client: SupabaseClient): Promise<AvatarMarketplaceProjection[]> {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("list_my_avatar_marketplace"));
  return (rows ?? []).map((row) => ({
    sku: String(row.sku),
    label: String(row.label),
    category: row.category as AvatarMarketplaceProjection["category"],
    value: String(row.value_key),
    equipGroup: String(row.equip_group),
    collections: row.collections as AvatarMarketplaceProjection["collections"],
    unlockMethod: row.unlock_method as AvatarMarketplaceProjection["unlockMethod"],
    purchaseSku: typeof row.purchase_sku === "string" ? row.purchase_sku : null,
    lamports: Number(row.lamports),
    rewardPoints: Number(row.reward_points),
    owned: row.owned === true,
    equipped: row.equipped === true,
    network: row.network === "devnet" ? "devnet" : null,
    assetStatus: row.asset_status as AvatarMarketplaceProjection["assetStatus"],
  }));
}

export async function setAvatarCosmetic(client: SupabaseClient, sku: string, equipped = true) {
  if (typeof equipped !== "boolean") throw new DataValidationError("equipped is invalid.");
  return unwrap(client.rpc("set_my_avatar_cosmetic", {
    target_sku: requiredText(sku, "sku", 80),
    target_equipped: equipped,
  }));
}

export async function getRewardSummary(client: SupabaseClient): Promise<RewardSummary> {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("get_my_reward_summary"));
  const row = rows?.[0] ?? {};
  return {
    balance: Number(row.balance ?? 0),
    lifetimeEarned: Number(row.lifetime_earned ?? 0),
    lifetimeSpent: Number(row.lifetime_spent ?? 0),
    unlockedSkus: Array.isArray(row.unlocked_skus) ? row.unlocked_skus.filter((sku): sku is string => typeof sku === "string") : [],
  };
}

export async function unlockRewardCosmetic(client: SupabaseClient, sku: string) {
  return unwrap(client.rpc("unlock_my_avatar_reward", { target_sku: requiredText(sku, "sku", 80) }));
}

export async function getMyProfile(client: SupabaseClient) {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("get_my_profile"));
  const row = rows?.[0];
  if (!row) return null;
  return {
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    eduDomain: row.edu_domain,
    solanaWallet: row.solana_wallet,
    interests: Array.isArray(row.interests) ? row.interests.filter((interest): interest is string => typeof interest === "string") : [],
    avatarConfig: validatedAvatarConfig(row.avatar_config),
    rating: row.rating == null ? null : Number(row.rating),
    ratingCount: row.rating_count,
    completedCount: row.completed_count,
  };
}

export async function listMyReceivedReviews(client: SupabaseClient) {
  const rows = await unwrap<Array<Record<string, unknown>>>(client.rpc("list_my_received_reviews"));
  return (rows ?? []).map((row) => ({
    id: row.id,
    score: Number(row.score),
    comment: row.comment,
    createdAt: row.created_at,
    author: { name: row.author_name, initials: row.author_initials },
    service: { title: row.service_title },
  }));
}

/** Server-side deterministic ranking; the RPC derives signals from the verified profile. */
export async function listRecommendedServices(client: SupabaseClient) {
  const rows = await unwrap<Array<PublicServiceRow & { score: number | string; explanation: string }>>(client.rpc("list_recommended_services"));
  return (rows ?? []).map((row) => ({
    ...mapPublicService(row),
    score: Number(row.score),
    explanation: row.explanation,
  }));
}
