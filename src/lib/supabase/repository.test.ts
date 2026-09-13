import { describe, expect, it, vi } from "vitest";
import { createService, listMessages, listMyReceivedReviews, listRequests, listServices, submitRating, updateProfile } from "./repository";

describe("Supabase repository boundaries", () => {
  it("loads public services through the safe RPC and maps a frontend DTO", async () => {
    const rpc = vi.fn(async () => ({ data: [{
      id: "service", title: "Math help", category: "Tutoring", subcategory: "Exam prep", description: "Calculus review",
      price_note: "$10", availability_note: "Tonight", scheduled_for: null,
      approximate_lat: 33.58, approximate_lng: -101.87, approximate_distance_miles: 0.42,
      provider_name: "Taylor S", provider_initials: "TS", provider_verified: true,
      provider_rating: "4.75", provider_rating_count: 12, provider_completed: 19,
      service_type: "temporary", sponsored: false,
    }], error: null }));
    const services = await listServices({ rpc } as never, { category: "Tutoring", listingKind: "temporary", subcategory: "Exam prep" });
    expect(rpc).toHaveBeenCalledWith("list_public_marketplace_services", expect.objectContaining({
      target_category: "Tutoring",
      target_listing_kind: "temporary",
      target_subcategory: "Exam prep",
    }));
    expect(services[0]).toMatchObject({
      approximatePosition: [33.58, -101.87],
      provider: { name: "Taylor S", rating: 4.75 },
    });
    expect(services[0]).not.toHaveProperty("exactPosition");
    expect(services[0]).not.toHaveProperty("providerId");
  });

  it("projects request and message participants without Auth0 subjects", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "list_my_service_requests" ? [{
      id: "request", service_id: "service", status: "accepted", viewer_role: "requester",
      other_party_name: "Jordan L", other_party_initials: "JL", service_title: "Math help",
      service_category: "Tutoring", created_at: "2026-09-12T00:00:00Z",
      my_completion: false, other_completion: false, my_rating: false, other_rating: false,
      my_location_shared: false, other_location_shared: false,
    }] : [{ id: "message", request_id: "00000000-0000-4000-8000-000000000002", body: "Hi", created_at: "2026-09-12T00:00:00Z", is_mine: true, sender_name: "Taylor S" }], error: null }));
    const requests = await listRequests({ rpc } as never);
    const messages = await listMessages({ rpc } as never, "00000000-0000-4000-8000-000000000002");
    expect(requests[0]).toMatchObject({ role: "requester", otherParty: { name: "Jordan L" } });
    expect(messages[0]).toMatchObject({ isMine: true, senderName: "Taylor S" });
    expect(JSON.stringify({ requests, messages })).not.toMatch(/auth0\||provider_id|requester_id|sender_id/);
  });

  it("derives service coordinates as WKT and calls the server RPC", async () => {
    const rpc = vi.fn(async (...args: unknown[]) => { void args; return { data: "service-id", error: null }; });
    const client = { rpc } as never;
    await createService(client, {
      category: "Services",
      subcategory: "Tech help",
      title: "Laptop tune-up",
      description: "Help with a slow laptop and setup.",
      priceNote: "Payment in person",
      availabilityNote: "Today",
      exactPoint: { latitude: 33.581, longitude: -101.871 },
    });
    expect(rpc).toHaveBeenCalledWith("create_service", expect.objectContaining({
      exact_wkt: "SRID=4326;POINT(-101.871 33.581)",
      service_subcategory: "Tech help",
    }));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("approximate_wkt");
  });

  it("rejects unsupported service categories before the database call", async () => {
    const rpc = vi.fn();
    await expect(createService({ rpc } as never, {
      category: "Anything" as never,
      title: "Laptop tune-up",
      description: "Help with a slow laptop and setup.",
      priceNote: "$15",
      availabilityNote: "Today",
      exactPoint: { latitude: 33.581, longitude: -101.871 },
    })).rejects.toThrow("category is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps permanent business pins out of the student service mutation", async () => {
    const rpc = vi.fn();
    await expect(createService({ rpc } as never, {
      category: "Businesses",
      subcategory: "Restaurants",
      title: "Campus cafe",
      description: "A permanent restaurant listing near campus.",
      priceNote: "Sponsored",
      availabilityNote: "Open weekdays",
      exactPoint: { latitude: 33.581, longitude: -101.871 },
    })).rejects.toThrow("reviewed sponsorship workflow");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects taxonomy values that do not belong to their category", async () => {
    const rpc = vi.fn();
    await expect(createService({ rpc } as never, {
      category: "Services",
      subcategory: "Chess",
      title: "Laptop tune-up",
      description: "Help with a slow laptop and setup.",
      priceNote: "$15",
      availabilityNote: "Today",
      exactPoint: { latitude: 33.581, longitude: -101.871 },
    })).rejects.toThrow("subcategory is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid listing filters before contacting Supabase", async () => {
    const rpc = vi.fn();
    await expect(listServices({ rpc } as never, { listingKind: "sponsored" as never })).rejects.toThrow("listingKind is invalid");
    await expect(listServices({ rpc } as never, { minRating: 6 })).rejects.toThrow("minRating is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects ratings outside the 1-5 range before contacting Supabase", async () => {
    const rpc = vi.fn();
    await expect(submitRating({ rpc } as never, "00000000-0000-4000-8000-000000000000", 6)).rejects.toThrow("between 1 and 5");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("trims an optional rating comment and enforces its 500 character limit", async () => {
    const rpc = vi.fn(async () => ({ data: "rating-id", error: null }));
    await submitRating({ rpc } as never, "00000000-0000-4000-8000-000000000000", 5, "  Helpful and on time.  ");
    expect(rpc).toHaveBeenCalledWith("submit_request_rating", expect.objectContaining({ target_comment: "Helpful and on time." }));
    rpc.mockClear();
    await expect(submitRating({ rpc } as never, "00000000-0000-4000-8000-000000000000", 5, "x".repeat(501))).rejects.toThrow("comment is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps only the dedicated current-subject review projection", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: "review", score: 5, comment: "Great", created_at: "2026-09-12T00:00:00Z", author_name: "Jordan L", author_initials: "JL", service_title: "Python help" }], error: null }));
    const reviews = await listMyReceivedReviews({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith("list_my_received_reviews");
    expect(reviews[0]).toEqual({ id: "review", score: 5, comment: "Great", createdAt: "2026-09-12T00:00:00Z", author: { name: "Jordan L", initials: "JL" }, service: { title: "Python help" } });
    expect(JSON.stringify(reviews)).not.toMatch(/subject_id|author_id|requester_id|provider_id|email|wallet|location/i);
  });

  it("allows only HTTPS avatar URLs", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(updateProfile({ rpc } as never, { avatarUrl: "javascript:alert(1)" })).rejects.toThrow("avatarUrl is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("updates only the current profile through the checked RPC", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(updateProfile({ rpc } as never, { displayName: "Taylor", interests: ["Tutoring"] })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("update_my_profile_without_wallet", expect.objectContaining({
      set_display_name: true,
      target_display_name: "Taylor",
      set_interests: true,
      target_interests: ["Tutoring"],
    }));
  });

  it("persists only the six approved free avatar dimensions", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const avatarConfig = { skin: "ebony", face: "focused", hair: "locs", hairColor: "ink", outfit: "tech", accessory: "glasses" } as const;
    await expect(updateProfile({ rpc } as never, { avatarConfig })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("update_my_profile_without_wallet", expect.objectContaining({
      set_avatar_config: true,
      target_avatar_config: avatarConfig,
    }));

    rpc.mockClear();
    await expect(updateProfile({ rpc } as never, { avatarConfig: { ...avatarConfig, accessory: "premium-crown" } as never })).rejects.toThrow("avatarConfig is invalid");
    await expect(updateProfile({ rpc } as never, { avatarConfig: { ...avatarConfig, frame: "retired-item" } as never })).rejects.toThrow("avatarConfig is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects direct wallet reassignment in favor of signed proof", async () => {
    const rpc = vi.fn();
    await expect(updateProfile({ rpc } as never, { solanaWallet: "Vote111111111111111111111111111111111111111" })).rejects.toThrow("signed wallet-link flow");
    expect(rpc).not.toHaveBeenCalled();
  });
});
