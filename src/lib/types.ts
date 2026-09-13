import type { ListingKind, ServiceCategory } from "./service-taxonomy";
import type { AvatarAssetStatus, AvatarMarketplaceCategory, AvatarUnlockMethod } from "./avatar-marketplace-catalog";

export type { ListingKind, ServiceCategory } from "./service-taxonomy";

export type Service = {
  id: string;
  provider: {
    avatarUrl?: string | null;
    name: string;
    initials: string;
    verified: boolean;
    rating: number;
    ratingCount: number;
    completed: number;
    responseMinutes: number;
  };
  title: string;
  description: string;
  category: ServiceCategory;
  subcategory?: string;
  listingKind?: ListingKind;
  sponsored?: boolean;
  price: string;
  availability: string;
  distanceMiles: number;
  approximatePosition: [number, number];
  accent: string;
  tags: string[];
};

/** Public discovery DTO: exact coordinates are never part of this shape. */
export type ServiceSummary = Service;

/** Returned only after participant checks and mutual active consent. */
export type SharedLocation = {
  serviceId: string;
  exactPoint: string;
  expiresAt: string;
};

export type RequestStage =
  | "idle"
  | "requested"
  | "accepted"
  | "meeting"
  | "completion_pending"
  | "rating_pending"
  | "closed"
  | "rejected"
  | "cancelled";

export type SessionProjection =
  | { authenticated: true; user: { verified: true; eduDomain: string } }
  | { authenticated: false; user: null };

export type ServiceRequestSummary = {
  id: string;
  serviceId: string;
  status: Exclude<RequestStage, "idle">;
  role: "requester" | "provider";
  otherParty: { name: string; initials: string };
  service: { title: string; category: string };
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  completion: { mine: boolean; theirs: boolean };
  ratings: { mine: boolean; theirs: boolean };
  location: { mine: boolean; theirs: boolean; expiresAt: string | null };
};

export type RequestMessage = {
  id: string;
  requestId: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  senderName: string;
};

export type SkinToneId = "porcelain" | "sand" | "golden" | "umber" | "cocoa" | "ebony";
export type HairStyleId = "crop" | "curls" | "locs" | "bob";
export type HairColorId = "ink" | "chestnut" | "auburn" | "violet";

export type AvatarConfig = {
  skin: SkinToneId;
  face: "smile" | "focused" | "wink";
  hair: HairStyleId;
  hairColor: HairColorId;
  outfit: "tee" | "hoodie" | "tech";
  accessory: "none" | "glasses" | "headphones";
};

export type ProfileProjection = {
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  eduDomain: string;
  solanaWallet: string | null;
  interests: string[];
  avatarConfig: AvatarConfig;
  rating: number | null;
  ratingCount: number;
  completedCount: number;
};

/** A review visible only to the signed-in subject after bilateral submission. */
export type ProfileReview = {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  author: { name: string; initials: string };
  service: { title: string };
};

export type AvatarMarketplaceProjection = {
  sku: string;
  label: string;
  category: AvatarMarketplaceCategory;
  value: string;
  equipGroup: string;
  collections: Array<"male" | "female">;
  unlockMethod: AvatarUnlockMethod;
  purchaseSku: string | null;
  lamports: number;
  rewardPoints: number;
  owned: boolean;
  equipped: boolean;
  network: "devnet" | null;
  assetStatus: AvatarAssetStatus;
};

export type RewardSummary = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  unlockedSkus: string[];
};

export type CosmeticQuote = {
  network: "devnet";
  productId: string;
  label: string;
  lamports: number;
  treasury: string;
  checkoutId: string;
};

export type CosmeticUnlockResult = {
  verified: true;
  network: "devnet";
  productId: string;
  label: string;
  lamports: number;
  slot: number;
  customizationId: string;
};

export type NotificationProjection = {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

export type RankingSignals = {
  categoryAffinity: number;
  adjustedRating: number;
  distance: number;
  reliability: number;
  responsiveness: number;
};

export type RankedService = Service & {
  score: number;
  signals: RankingSignals;
  explanation: string;
};
