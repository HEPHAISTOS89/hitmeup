"use client";

import {
  ArrowLeft, ArrowRight, BadgeDollarSign, BadgeCheck, BadgePercent, Bell, Bike, BookOpen,
  Briefcase, Calendar, CalendarDays, Camera, Car, Check, ChevronRight, CircleDot,
  CircleHelp, CircleDollarSign, Clock3, ClipboardCheck, Code2, Coffee, Compass,
  Crown, Dices, Dumbbell, Filter, Gamepad2, Goal, GraduationCap, Hammer,
  HandHelping, HeartHandshake, Languages, Laptop, LayoutGrid, Library,
  LocateFixed, LockKeyhole, MapPin, Megaphone, MessageCircle, Mic2, Mountain,
  Music2, Navigation, PackageOpen, Palette, PartyPopper, Pencil, PersonStanding,
  Plus, PlugZap, Presentation, Search, Send, Scissors, Settings2, ShieldCheck,
  ShoppingBag, Sparkles, SprayCan, Star, Store, Ticket, Trash2, Trees,
  TriangleAlert, Trophy, UserRound, Users, Utensils, Wrench, X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { CampusMap } from "./campus-map";
import { RatingGate } from "./rating-gate";
import { ProfileAvatarLink, ProfileAvatarPicture } from "./profile-avatar-link";
import { EntryFlow, type EntryState } from "./entry-flow";
import { HitMeUpLogo } from "./hitmeup-logo";
import { ThemeToggle } from "./theme-toggle";
import { CAMPUS_CENTER, SERVICES } from "@/lib/service-catalog";
import {
  ApiError,
  confirmCompletion,
  createRequest,
  createService,
  getMessages,
  getNotifications,
  getProfile,
  getReceivedReviews,
  getRequests,
  getServices,
  getSharedLocation,
  markNotificationsRead,
  postMessage,
  revokeLocation,
  shareLocation,
  submitRating,
  suggestServiceDraft,
  updateProfile,
  updateRequestStatus,
} from "@/lib/client-api";
import { filterAndRankServices } from "@/lib/discovery";
import { groupProfileActivity, profileActivityDate, profileActivityRoleLabel, providedServiceCount } from "@/lib/profile-experience";
import { canRevealExactLocation } from "@/lib/privacy";
import { canTransitionRequest } from "@/lib/request-state";
import { CATEGORY_CATALOG, SERVICE_CATEGORIES, categoryAccent, categoryDefinition, isServiceCategory, subcategoriesFor, type ServiceIconName } from "@/lib/service-taxonomy";
import type { ListingKind, NotificationProjection, ProfileProjection, ProfileReview, RequestMessage, RequestStage, Service, ServiceCategory, ServiceRequestSummary, SharedLocation } from "@/lib/types";

const CATEGORIES: Array<ServiceCategory | "All"> = ["All", ...SERVICE_CATEGORIES];

const SUGGESTED_CATEGORY_ALIASES: Record<string, ServiceCategory> = {
  "Tech help": "Services", Ride: "Help", Creative: "Services", Moving: "Services", Other: "Help",
};

const SERVICE_ICONS: Record<ServiceIconName, LucideIcon> = {
  party: PartyPopper, wrench: Wrench, graduation: GraduationCap, briefcase: Briefcase,
  heart: HeartHandshake, game: Gamepad2, activity: Dumbbell, ticket: Ticket, store: Store,
  help: HandHelping, users: Users, trophy: Trophy, food: Utensils, sparkles: Sparkles,
  camera: Camera, scissors: Scissors, laptop: Laptop, cleaning: SprayCan, hammer: Hammer,
  book: BookOpen, code: Code2, languages: Languages, calendar: Calendar, money: BadgeDollarSign,
  clipboard: ClipboardCheck, trash: Trash2, donations: PackageOpen, trees: Trees,
  megaphone: Megaphone, palette: Palette, music: Music2, chess: Crown,
  basketball: CircleDot, soccer: Goal, running: PersonStanding, mountain: Mountain, bike: Bike,
  games: Dices, workshop: Presentation, microphone: Mic2, shopping: ShoppingBag,
  promotion: BadgePercent, coffee: Coffee, charger: PlugZap, library: Library, question: CircleHelp,
};

function ServiceGlyph({ name, size = 20 }: { name: ServiceIconName; size?: number }) {
  const Icon = SERVICE_ICONS[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}

const STAGE_LABEL: Record<RequestStage, string> = {
  idle: "Not requested",
  requested: "Request sent",
  accepted: "Accepted",
  meeting: "Meeting up",
  completion_pending: "Confirm completion",
  rating_pending: "Ratings required",
  closed: "Complete",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const PREVIEW_PROFILE: ProfileProjection = {
  displayName: "Taylor Garcia",
  avatarUrl: null,
  bio: "I like practical problem solving, campus projects, and making one-off help feel easy to ask for.",
  eduDomain: "ttu.edu",
  solanaWallet: null,
  interests: ["Hackathons", "Python", "Study groups", "Photography"],
  avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "headphones" },
  rating: 4.9,
  ratingCount: 2,
  completedCount: 3,
};

const PREVIEW_REQUESTS: ServiceRequestSummary[] = [
  {
    id: "preview-active", serviceId: "math-midterms", status: "requested", role: "requester",
    otherParty: { name: "Maya Chen", initials: "MC" }, service: { title: "Calculus rescue session", category: "Tutoring" },
    createdAt: "2026-09-12T16:25:00-05:00", acceptedAt: null, closedAt: null,
    completion: { mine: false, theirs: false }, ratings: { mine: false, theirs: false },
    location: { mine: false, theirs: false, expiresAt: null },
  },
  {
    id: "preview-provided", serviceId: "preview-service-provided", status: "closed", role: "provider",
    otherParty: { name: "Jordan Lee", initials: "JL" }, service: { title: "Portfolio feedback", category: "Creative" },
    createdAt: "2026-09-05T17:00:00-05:00", acceptedAt: "2026-09-05T17:08:00-05:00", closedAt: "2026-09-05T18:02:00-05:00",
    completion: { mine: true, theirs: true }, ratings: { mine: true, theirs: true },
    location: { mine: false, theirs: false, expiresAt: null },
  },
  {
    id: "preview-requested", serviceId: "preview-service-requested", status: "closed", role: "requester",
    otherParty: { name: "Nina Brooks", initials: "NB" }, service: { title: "Laptop setup", category: "Tech help" },
    createdAt: "2026-08-27T13:00:00-05:00", acceptedAt: "2026-08-27T13:12:00-05:00", closedAt: "2026-08-27T14:10:00-05:00",
    completion: { mine: true, theirs: true }, ratings: { mine: true, theirs: true },
    location: { mine: false, theirs: false, expiresAt: null },
  },
];

const PREVIEW_REVIEWS: ProfileReview[] = [
  { id: "preview-review-1", score: 5, comment: "Clear, prepared, and thoughtful throughout the session.", createdAt: "2026-09-05T18:05:00-05:00", author: { name: "Jordan Lee", initials: "JL" }, service: { title: "Portfolio feedback" } },
  { id: "preview-review-2", score: 5, comment: "Showed up on time and made the setup easy to follow.", createdAt: "2026-08-27T14:14:00-05:00", author: { name: "Nina Brooks", initials: "NB" }, service: { title: "Laptop setup" } },
];

type AppView = "discover" | "requests" | "profile";
type EntryTarget = EntryState | "app";
type DataMode = "live" | "preview";
type SurfaceMode = "default" | "loading" | "offline";
type ChatConnection = "preview" | "connecting" | "online" | "reconnecting";
type ListingFilter = ListingKind | "all";

function notificationCopy(notification: NotificationProjection) {
  if (notification.payload && typeof notification.payload === "object") {
    const payload = notification.payload as Record<string, unknown>;
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.title === "string") return payload.title;
  }
  return notification.type.replaceAll("_", " ");
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function chatScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

function currentChatScrollBehavior(): ScrollBehavior {
  const prefersReducedMotion = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return chatScrollBehavior(prefersReducedMotion);
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function serviceFromRequest(request: ServiceRequestSummary): Service {
  const category = CATEGORIES.includes(request.service.category as ServiceCategory)
    ? request.service.category as ServiceCategory
    : "Services";
  return {
    id: request.serviceId,
    provider: { name: request.otherParty.name, initials: request.otherParty.initials, verified: true, rating: 0, ratingCount: 0, completed: 0, responseMinutes: 0 },
    title: request.service.title,
    description: "Private request details are available to the two participants.",
    category,
    subcategory: request.service.category,
    listingKind: "temporary",
    price: "Coordinated directly",
    availability: "See the private conversation",
    distanceMiles: 0,
    approximatePosition: CAMPUS_CENTER,
    accent: "#e7011f",
    tags: ["Active request", "Private"],
  };
}

function serviceForRequest(request: ServiceRequestSummary, service?: Service): Service {
  const base = service ?? serviceFromRequest(request);
  if (request.role === "requester") return base;
  return {
    ...base,
    // A provider's counterpart is the requester, not the provider attached to
    // the public service card. Avoid showing or rating the signed-in provider.
    provider: {
      name: request.otherParty.name,
      initials: request.otherParty.initials,
      verified: true,
      rating: 0,
      ratingCount: 0,
      completed: 0,
      responseMinutes: 0,
    },
  };
}

export function CampusMarketplace({ initialEntry = "splash", dataMode = "live" }: { initialEntry?: EntryTarget; dataMode?: DataMode }) {
  const [entry, setEntry] = useState<EntryTarget>(initialEntry);

  function completeEntry() { setEntry("app"); }

  if (entry !== "app") return <EntryFlow initialEntry={entry} onComplete={completeEntry} />;
  return <MarketplaceShell dataMode={dataMode} />;
}

function MarketplaceShell({ dataMode }: { dataMode: DataMode }) {
  // The avatar page links back with `#profile`; the shell is mounted client-side
  // behind AppGate, so reading the hash during initialization is safe.
  const [view, setView] = useState<AppView>(() => typeof window !== "undefined" && window.location.hash === "#profile" ? "profile" : "discover");
  const [services, setServices] = useState<Service[]>(dataMode === "preview" ? SERVICES : []);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [subcategory, setSubcategory] = useState<string>();
  const [query, setQuery] = useState("");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(3);
  const [minimumRating, setMinimumRating] = useState(0);
  const [availableNow, setAvailableNow] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(dataMode === "preview" ? SERVICES[0]?.id : undefined);
  const [pinOpen, setPinOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [businessModal, setBusinessModal] = useState<Service | "sponsor" | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [stage, setStage] = useState<RequestStage>(dataMode === "preview" ? "requested" : "idle");
  const [requesterShared, setRequesterShared] = useState(false);
  const [providerShared, setProviderShared] = useState(false);
  const [requesterCompleted, setRequesterCompleted] = useState(false);
  const [providerCompleted, setProviderCompleted] = useState(false);
  const [requesterRating, setRequesterRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [otherRatingSubmitted, setOtherRatingSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<RequestMessage[]>(dataMode === "preview" ? [
    { id: "preview-1", requestId: "preview", body: "Hi! Is the 4:30 PM slot still open?", isMine: true, senderName: "You", createdAt: "2026-09-12T16:28:00-05:00" },
    { id: "preview-2", requestId: "preview", body: "Yes — send a request and we can meet near the engineering key.", isMine: false, senderName: "Maya", createdAt: "2026-09-12T16:29:00-05:00" },
  ] : []);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatConnection, setChatConnection] = useState<ChatConnection>(dataMode === "preview" ? "preview" : "connecting");
  const [requests, setRequests] = useState<ServiceRequestSummary[]>(dataMode === "preview" ? PREVIEW_REQUESTS : []);
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(dataMode === "preview" ? PREVIEW_REQUESTS[0]?.id : undefined);
  const [profile, setProfile] = useState<ProfileProjection | null>(dataMode === "preview" ? PREVIEW_PROFILE : null);
  const [reviews, setReviews] = useState<ProfileReview[]>(dataMode === "preview" ? PREVIEW_REVIEWS : []);
  const [reviewsStatus, setReviewsStatus] = useState<"loading" | "ready" | "error">(dataMode === "preview" ? "ready" : "loading");
  const [notifications, setNotifications] = useState<NotificationProjection[]>([]);
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null);
  const [dataError, setDataError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(dataMode === "live" ? "loading" : "default");
  const [serviceDraft, setServiceDraft] = useState({ title: "", category: "Tutoring" as ServiceCategory, subcategory: "Tutoring", availability: "", description: "", price: "" });
  const [draftReviewed, setDraftReviewed] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantSource, setAssistantSource] = useState<"gemini" | "deterministic-fallback" | "template">();
  const [assistantError, setAssistantError] = useState("");
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const activeRequestIdRef = useRef<string | undefined>(dataMode === "preview" ? PREVIEW_REQUESTS[0]?.id : undefined);
  const requestsFetchGeneration = useRef(0);

  const visibleServices = useMemo(() => filterAndRankServices(
    services,
    {
      query,
      categories: category === "All" ? [] : [category],
      maxDistanceMiles,
      minimumRating,
      availableNow,
      listingKind: listingFilter,
      subcategory,
    },
    [],
  ), [availableNow, category, listingFilter, maxDistanceMiles, minimumRating, query, services, subcategory]);

  const presentedServices = visibleServices;
  const selectedCategoryDefinition = category === "All" ? undefined : categoryDefinition(category);
  const availableSubcategories = category === "All" ? [] : subcategoriesFor(category);

  const selected = presentedServices.find((service) => service.id === selectedId) ?? presentedServices[0];
  const currentRequest = requests.find((request) => request.id === activeRequestId);
  const activeService = currentRequest
    ? serviceForRequest(currentRequest, services.find((service) => service.id === currentRequest.serviceId))
    : undefined;
  const drawerService = activeRequestId ? activeService : selected;
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const pendingRating = requests.find((request) => request.status === "rating_pending" && !request.ratings.mine);
  const ratingBlocked = Boolean(pendingRating) || (stage === "rating_pending" && !currentRequest?.ratings.mine);
  const exactLocationVisible = ["accepted", "meeting"].includes(stage)
    && canRevealExactLocation(stage, requesterShared, providerShared);

  // A request waiting on our rating takes precedence over whatever was selected:
  // the rating gate must show the right counterpart.
  const requestToProject = useCallback((items: ServiceRequestSummary[], preferred: ServiceRequestSummary | undefined) =>
    items.find((item) => item.status === "rating_pending" && !item.ratings.mine) ?? preferred, []);

  const applyRequestProjection = useCallback((request: ServiceRequestSummary) => {
    if (activeRequestIdRef.current !== request.id) {
      activeRequestIdRef.current = request.id;
      setMessages([]);
      setMessage("");
      setMessagesLoading(dataMode === "live");
      setChatError("");
      setChatConnection(dataMode === "preview" ? "preview" : "connecting");
      setSharedLocation(null);
    }
    setActiveRequestId(request.id);
    setStage(request.status);
    setRequesterShared(Boolean(request.location.mine));
    setProviderShared(Boolean(request.location.theirs));
    setRequesterCompleted(Boolean(request.completion.mine));
    setProviderCompleted(Boolean(request.completion.theirs));
    if (!request.ratings.mine) setRequesterRating(0);
    setOtherRatingSubmitted(Boolean(request.ratings.theirs));
  }, [dataMode]);

  useEffect(() => {
    if (dataMode === "preview") return;
    const timer = window.setTimeout(() => {
      setSurfaceMode("loading");
      getServices({
        category: category === "All" ? undefined : category,
        query: query.trim() || undefined,
        minRating: minimumRating || undefined,
        maxDistanceMiles,
        listingKind: listingFilter === "all" ? undefined : listingFilter,
        subcategory,
      })
        .then((next) => {
          setServices(next);
          setSelectedId((current) => next.some((service) => service.id === current) ? current : next[0]?.id);
          setDataError("");
          setSurfaceMode("default");
        })
        .catch((error) => {
          setDataError(error instanceof Error ? error.message : "Services could not be loaded.");
          setSurfaceMode("offline");
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [category, dataMode, listingFilter, maxDistanceMiles, minimumRating, query, subcategory]);

  useEffect(() => {
    if (dataMode === "preview") return;
    let active = true;
    const refresh = async () => {
      const requestGeneration = ++requestsFetchGeneration.current;
      const results = await Promise.allSettled([getRequests(), getProfile(), getNotifications(), getReceivedReviews()]);
      if (!active) return;
      if (results[0].status === "fulfilled" && requestGeneration === requestsFetchGeneration.current) {
        const selectedRequestId = activeRequestIdRef.current;
        const request = requestToProject(results[0].value, selectedRequestId
          ? results[0].value.find((item) => item.id === selectedRequestId)
          : results[0].value.find((item) => !["closed", "rejected", "cancelled"].includes(item.status)) ?? results[0].value[0]);
        if (!selectedRequestId || request) {
          setRequests(results[0].value);
          if (request) applyRequestProjection(request);
        }
      }
      if (results[1].status === "fulfilled") setProfile(results[1].value);
      if (results[2].status === "fulfilled") setNotifications(results[2].value);
      if (results[3].status === "fulfilled") {
        setReviews(results[3].value);
        setReviewsStatus("ready");
      } else setReviewsStatus("error");
    };
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [applyRequestProjection, dataMode, requestToProject]);

  useEffect(() => {
    if (dataMode === "preview" || !activeRequestId || stage === "idle") return;
    const requestId = activeRequestId;
    const serviceId = currentRequest?.serviceId;
    let active = true;
    getMessages(requestId)
      .then((items) => { if (active && activeRequestIdRef.current === requestId) { setMessages(items); setChatError(""); } })
      .catch((error) => { if (active && activeRequestIdRef.current === requestId) setChatError(error instanceof Error ? error.message : "Messages could not be loaded."); })
      .finally(() => { if (active && activeRequestIdRef.current === requestId) setMessagesLoading(false); });
    if (requesterShared && providerShared) {
      getSharedLocation(requestId).then((location) => {
        if (active && activeRequestIdRef.current === requestId && serviceId && location?.serviceId === serviceId) setSharedLocation(location);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activeRequestId, currentRequest?.serviceId, dataMode, providerShared, requesterShared, stage]);

  useEffect(() => {
    if (dataMode === "preview" || !activeRequestId || !requestOpen || stage === "idle") return;
    const requestId = activeRequestId;
    let active = true;
    const source = new EventSource(`/api/data/requests/${requestId}/messages/stream`, { withCredentials: true });
    source.onopen = () => { if (active && activeRequestIdRef.current === requestId) setChatConnection("online"); };
    source.addEventListener("messages", (event) => {
      if (!active || activeRequestIdRef.current !== requestId) return;
      try {
        const payload = JSON.parse(event.data) as { messages?: RequestMessage[] };
        if (Array.isArray(payload.messages)) setMessages(payload.messages);
        setChatError("");
        setChatConnection("online");
      } catch {
        setChatConnection("reconnecting");
      }
    });
    source.addEventListener("stream-error", () => { if (active && activeRequestIdRef.current === requestId) setChatConnection("reconnecting"); });
    source.onerror = () => { if (active && activeRequestIdRef.current === requestId) setChatConnection("reconnecting"); };
    return () => { active = false; source.close(); };
  }, [activeRequestId, dataMode, requestOpen, stage]);

  useEffect(() => {
    if (ratingBlocked || (!requestOpen && !createOpen && !settingsOpen && !notificationsOpen)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRequestOpen(false);
        setCreateOpen(false);
        setSettingsOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    if (requestOpen) window.setTimeout(() => drawerCloseRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, notificationsOpen, requestOpen, settingsOpen, ratingBlocked]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || (!ratingBlocked && !requestOpen && !createOpen && !settingsOpen)) return;
    const background = Array.from(shell.children).filter((element) => ratingBlocked ? !element.classList.contains("rating-gate") : !element.classList.contains("drawer-layer"));
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => background.forEach((element) => element.removeAttribute("inert"));
  }, [createOpen, requestOpen, settingsOpen, ratingBlocked]);

  function resetRequest() {
    setStage("idle");
    setRequesterShared(false);
    setProviderShared(false);
    setRequesterCompleted(false);
    setRequesterRating(0);
    setRatingComment("");
    setOtherRatingSubmitted(false);
    setSharedLocation(null);
  }

  function clearActiveRequest() {
    activeRequestIdRef.current = undefined;
    setActiveRequestId(undefined);
    setMessages([]);
    setMessage("");
    setMessagesLoading(false);
    resetRequest();
  }

  function openActiveRequest() {
    if (dataMode === "live") {
      setChatConnection("connecting");
      retryMessages();
    }
    setRequestOpen(true);
  }

  function openSelectedRequest() {
    if (dataMode === "live") {
      const existing = requests.find((request) => request.serviceId === selected?.id && !["closed", "rejected", "cancelled"].includes(request.status));
      if (existing) {
        const switchingRequest = activeRequestIdRef.current !== existing.id;
        applyRequestProjection(existing);
        if (!switchingRequest) retryMessages();
      }
      else {
        clearActiveRequest();
      }
      setChatConnection("connecting");
    } else if (activeRequestId && currentRequest?.serviceId !== selected?.id) {
      // Preview opens on a sample request so the flow is visible. Once a
      // different listing is selected, discard that sample state before the
      // drawer opens instead of showing its stage or private conversation.
      clearActiveRequest();
    }
    setRequestOpen(true);
  }

  function selectService(id: string) {
    if (ratingBlocked) {
      const pendingRating = requests.find((request) => request.status === "rating_pending" && !request.ratings.mine);
      if (pendingRating) applyRequestProjection(pendingRating);
      openActiveRequest();
      return;
    }
    setSelectedId(id);
    setPinOpen(true);
    if (dataMode === "preview" && id !== selectedId) clearActiveRequest();
  }

  function transition(next: RequestStage) {
    if (canTransitionRequest(stage, next)) setStage(next);
  }

  async function runAction(action: () => Promise<void>) {
    setActionBusy(true);
    setDataError("");
    try {
      await action();
    } catch (error) {
      setDataError(error instanceof ApiError ? error.message : "The action could not be completed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function refreshRequests(preferredId?: string) {
    if (dataMode === "preview") return;
    const requestGeneration = ++requestsFetchGeneration.current;
    const next = await getRequests();
    if (requestGeneration !== requestsFetchGeneration.current) return;
    if (preferredId && activeRequestIdRef.current !== preferredId) return;
    const selectedRequestId = preferredId ?? activeRequestIdRef.current;
    const request = requestToProject(next, selectedRequestId
      ? next.find((item) => item.id === selectedRequestId)
      : next.find((item) => !["closed", "rejected", "cancelled"].includes(item.status)) ?? next[0]);
    if (selectedRequestId && !request) return;
    setRequests(next);
    if (!request) return;
    applyRequestProjection(request);
    if (!request.location.mine || !request.location.theirs) setSharedLocation(null);
  }

  function beginRequest() {
    if (!selected || actionBusy) return;
    if (dataMode === "preview") {
      const clean = message.trim();
      if (clean) setMessages((current) => [...current, { id: `preview-${Date.now()}`, requestId: "preview", body: clean, isMine: true, senderName: "You", createdAt: new Date().toISOString() }]);
      setMessage("");
      transition("requested");
      return;
    }
    void runAction(async () => {
      const result = await createRequest(selected.id);
      const clean = message.trim();
      if (clean) await postMessage(result.id, clean);
      setMessage("");
      activeRequestIdRef.current = result.id;
      setActiveRequestId(result.id);
      setStage("requested");
      await refreshRequests(result.id);
    });
  }

  function cancelRequest() {
    if (dataMode === "preview") { transition("cancelled"); return; }
    if (!activeRequestId) return;
    void runAction(async () => { await updateRequestStatus(activeRequestId, "cancelled"); await refreshRequests(activeRequestId); });
  }

  function acceptRequest() {
    if (dataMode === "preview") { transition("accepted"); return; }
    if (!activeRequestId || currentRequest?.role !== "provider") return;
    void runAction(async () => { await updateRequestStatus(activeRequestId, "accepted"); await refreshRequests(activeRequestId); });
  }

  function rejectRequest() {
    if (dataMode === "preview") { transition("rejected"); return; }
    if (!activeRequestId || currentRequest?.role !== "provider") return;
    void runAction(async () => { await updateRequestStatus(activeRequestId, "rejected"); await refreshRequests(activeRequestId); });
  }

  function startMeeting() {
    if (dataMode === "preview") { transition("meeting"); return; }
    if (!activeRequestId) return;
    void runAction(async () => { await updateRequestStatus(activeRequestId, "meeting"); await refreshRequests(activeRequestId); });
  }

  function setMyLocation(next: boolean) {
    if (!next) setSharedLocation(null);
    if (dataMode === "preview") { setRequesterShared(next); return; }
    if (!activeRequestId) return;
    void runAction(async () => {
      if (next) await shareLocation(activeRequestId); else await revokeLocation(activeRequestId);
      await refreshRequests(activeRequestId);
    });
  }

  function completeService() {
    if (dataMode === "preview") {
      if (stage === "completion_pending") {
        setRequesterCompleted(true);
        if (providerCompleted) setStage("rating_pending");
      } else transition("completion_pending");
      return;
    }
    if (!activeRequestId) return;
    void runAction(async () => { await confirmCompletion(activeRequestId); await refreshRequests(activeRequestId); });
  }

  function rateService() {
    if (!Number.isInteger(requesterRating) || requesterRating < 1 || requesterRating > 5 || actionBusy) return;
    if (dataMode === "preview") {
      setRequests((items) => items.map((request) => request.id === activeRequestId ? { ...request, ratings: { ...request.ratings, mine: true } } : request));
      setRatingComment("");
      setStage(otherRatingSubmitted ? "closed" : "rating_pending");
      setRequestOpen(false);
      return;
    }
    if (!activeRequestId || requesterRating < 1) return;
    void runAction(async () => {
      await submitRating(activeRequestId, requesterRating, ratingComment.trim() || undefined);
      setRatingComment("");
      await refreshRequests(activeRequestId);
    });
  }

  function sendMessage() {
    const clean = message.trim();
    if (!clean || actionBusy) return;
    if (dataMode === "preview") {
      setMessages((current) => [...current, { id: `preview-${Date.now()}`, requestId: "preview", body: clean, isMine: true, senderName: "You", createdAt: new Date().toISOString() }]);
      setMessage("");
      return;
    }
    if (!activeRequestId) return;
    const requestId = activeRequestId;
    setChatError("");
    void runAction(async () => {
      await postMessage(requestId, clean);
      if (activeRequestIdRef.current !== requestId) return;
      setMessage("");
      const nextMessages = await getMessages(requestId);
      if (activeRequestIdRef.current === requestId) setMessages(nextMessages);
    });
  }

  function retryMessages() {
    if (!activeRequestId || dataMode === "preview") return;
    const requestId = activeRequestId;
    setMessagesLoading(true);
    setChatError("");
    void getMessages(requestId)
      .then((items) => { if (activeRequestIdRef.current === requestId) setMessages(items); })
      .catch((error) => { if (activeRequestIdRef.current === requestId) setChatError(error instanceof Error ? error.message : "Messages could not be loaded."); })
      .finally(() => { if (activeRequestIdRef.current === requestId) setMessagesLoading(false); });
  }

  function directionsUrl(mode: "walking" | "driving") {
    if (!currentRequest || sharedLocation?.serviceId !== currentRequest.serviceId) return undefined;
    const point = sharedLocation?.exactPoint.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (!point) return undefined;
    return `https://www.google.com/maps/dir/?api=1&destination=${point[2]},${point[1]}&travelmode=${mode}`;
  }

  async function useWritingAssistant() {
    setAssistantError("");
    if (dataMode === "preview") {
      setServiceDraft({ title: "Calculus problem-set rescue", category: "Tutoring", subcategory: "Homework help", availability: "Today after 4:30 PM", description: "One focused session for the problem you are stuck on. We will work through it together.", price: "$18 / hour" });
      setAssistantSource("template");
      setDraftReviewed(false);
      return;
    }
    if (!serviceDraft.title.trim() && !serviceDraft.description.trim()) {
      setAssistantError("Add a title or description first.");
      return;
    }
    setAssistantBusy(true);
    try {
      const suggestion = await suggestServiceDraft({ title: serviceDraft.title, description: serviceDraft.description });
      const suggestedCategory = isServiceCategory(suggestion.category)
        ? suggestion.category
        : SUGGESTED_CATEGORY_ALIASES[suggestion.category];
      const suggestedSubcategory = suggestedCategory
        ? subcategoriesFor(suggestedCategory).find((item) => item.label === suggestion.subcategory)?.label
        : undefined;
      setServiceDraft((current) => ({
        ...current,
        title: suggestion.suggestedTitle || current.title,
        category: suggestedCategory ?? current.category,
        subcategory: suggestedSubcategory
          ?? (suggestedCategory ? subcategoriesFor(suggestedCategory)[0].label : current.subcategory),
      }));
      setAssistantSource(suggestion.source);
      setDraftReviewed(false);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Writing assistance is unavailable.");
    } finally {
      setAssistantBusy(false);
    }
  }

  function publishService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftReviewed || !serviceDraft.title.trim() || !serviceDraft.description.trim()) return;
    if (dataMode === "live") {
      void runAction(async () => {
        if (!("geolocation" in navigator)) throw new ApiError("Location is unavailable in this browser.", 400);
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
        }).catch(() => { throw new ApiError("Allow location once to create an approximate service zone.", 400); });
        const result = await createService({
          title: serviceDraft.title.trim(),
          category: serviceDraft.category,
          subcategory: serviceDraft.subcategory,
          description: serviceDraft.description.trim(),
          priceNote: serviceDraft.price.trim() || "Coordinate in chat",
          availabilityNote: serviceDraft.availability.trim(),
          exactPoint: { latitude: position.coords.latitude, longitude: position.coords.longitude },
        });
        const next = await getServices({ maxDistanceMiles });
        setServices(next);
        setSelectedId(result.id);
        setCreateOpen(false);
        setView("discover");
        setServiceDraft({ title: "", category: "Tutoring", subcategory: "Tutoring", availability: "", description: "", price: "" });
        setDraftReviewed(false);
      });
      return;
    }
    const newService: Service = {
      id: `local-${Date.now()}`,
      provider: { name: "You", initials: "YO", verified: true, rating: 0, ratingCount: 0, completed: 0, responseMinutes: 0 },
      title: serviceDraft.title.trim(), description: serviceDraft.description.trim(), category: serviceDraft.category,
      subcategory: serviceDraft.subcategory, listingKind: "temporary",
      price: serviceDraft.price.trim() || "Set in chat", availability: serviceDraft.availability.trim() || "Coordinate in chat",
      distanceMiles: 0.2, approximatePosition: [CAMPUS_CENTER[0] + 0.0011, CAMPUS_CENTER[1] - 0.001], accent: categoryAccent(serviceDraft.category), tags: ["New", "One-off"],
    };
    setServices((current) => [newService, ...current]);
    setSelectedId(newService.id);
    setCreateOpen(false);
    setView("discover");
    setServiceDraft({ title: "", category: "Tutoring", subcategory: "Tutoring", availability: "", description: "", price: "" });
    setDraftReviewed(false);
  }

  function resetFilters() {
    setQuery(""); setCategory("All"); setListingFilter("all"); setSubcategory(undefined); setMaxDistanceMiles(3); setMinimumRating(0); setAvailableNow(false);
  }

  function selectCategoryFilter(next: ServiceCategory | "All") {
    setCategory(next);
    setSubcategory(undefined);
    if (next === "Businesses") setListingFilter("permanent");
    else if (next !== "All" && listingFilter === "permanent") setListingFilter("temporary");
  }

  return (
    <main ref={shellRef} className={`app-shell ${view === "requests" ? "messaging-shell" : ""}`} id="top">
      {ratingBlocked && <RatingGate name={pendingRating?.otherParty.name ?? drawerService?.provider.name ?? "the other student"} value={requesterRating} onChange={setRequesterRating} onSubmit={rateService} busy={actionBusy || Boolean(pendingRating && pendingRating.id !== activeRequestId)} error={dataError} />}
      <header className="topbar">
        <a className="brand" href="#discover" aria-label="HitMeUp home" onClick={() => setView("discover")}><HitMeUpLogo size={40} /><span><strong>HitMeUp</strong></span></a>
        <nav className="topnav" aria-label="Primary navigation">
          <button className={view === "discover" ? "active" : ""} type="button" onClick={() => setView("discover")}><Compass size={17} /> Discover</button>
          <button className={view === "requests" ? "active" : ""} type="button" onClick={() => setView("requests")}><MessageCircle size={17} /> Requests{(ratingBlocked || unreadCount > 0) && <b className="nav-alert">{unreadCount || 1}</b>}</button>
          <button className={view === "profile" ? "active" : ""} type="button" onClick={() => setView("profile")}><UserRound size={17} /> Profile</button>
        </nav>
        <div className="top-actions">
          <ThemeToggle />
          <button className="icon-button" type="button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={notificationsOpen} onClick={() => { const next = !notificationsOpen; setNotificationsOpen(next); if (next && dataMode === "live" && notifications.some((item) => !item.readAt)) void markNotificationsRead().then(() => setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })))).catch(() => undefined); }}><Bell size={19} />{unreadCount > 0 && <span className="notification-dot" />}</button>
          <button className="avatar" type="button" aria-label="Open profile" onClick={() => setView("profile")}><ProfileAvatarPicture /></button>
        </div>
        {notificationsOpen && <aside className="notification-popover" aria-label="Notifications"><div className="popover-heading"><span>Notifications</span><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>{notifications.length ? notifications.slice(0, 3).map((item) => <p key={item.id}><Bell size={16} /> {notificationCopy(item)}</p>) : <p><Bell size={16} /> You&apos;re all caught up. Request updates will appear here.</p>}<button className="text-button" type="button" onClick={() => { setNotificationsOpen(false); setView("requests"); }}>Open requests <ChevronRight size={15} /></button></aside>}
      </header>

      {ratingBlocked && <div className="blocking-banner" role="status"><Star size={16} fill="currentColor" /> Finish your required rating to start another service.<button type="button" onClick={openActiveRequest}>Open rating</button></div>}
      {dataError && <div className="blocking-banner data-error-banner" role="alert"><TriangleAlert size={16} /> {dataError}<button type="button" onClick={() => setDataError("")}>Dismiss</button></div>}

      {view === "discover" && <section className="discover-frame" id="discover">
        <CategoryRail
          activeCategory={category}
          listingFilter={listingFilter}
          services={services}
          onCategory={selectCategoryFilter}
          onListingFilter={(next) => {
            setListingFilter(next);
            setSubcategory(undefined);
            if (next === "permanent") setCategory("Businesses");
            else if (category === "Businesses") setCategory("All");
          }}
        />
        <section className="workspace">
          <aside className="discovery-panel" aria-label="Discovery filters">
            <div className="panel-intro"><p className="eyebrow">DISCOVER NEARBY</p><h1>{listingFilter === "permanent" ? "Local, for longer." : "What are you up for?"}</h1></div>
            <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans, help, or places" aria-label="Search listings" /></label>
            {!selectedCategoryDefinition && <div className="subcategory-grid search-presets" role="group" aria-label="Search presets">
              {CATEGORY_CATALOG.map((item) => <button key={item.id} type="button" onClick={() => selectCategoryFilter(item.id)} style={{ "--category-accent": item.accent } as CSSProperties}><ServiceGlyph name={item.icon} size={16} /><span>{item.shortLabel}</span></button>)}
            </div>}
            {selectedCategoryDefinition && <section className="category-focus" style={{ "--category-accent": selectedCategoryDefinition.accent } as CSSProperties}>
              <button className="back-button category-back" type="button" onClick={() => selectCategoryFilter("All")}><ArrowLeft size={14} /> Back to categories</button>
              <div className="category-focus-title"><span><ServiceGlyph name={selectedCategoryDefinition.icon} /></span><div><strong>{selectedCategoryDefinition.label}</strong><p>{selectedCategoryDefinition.description}</p></div></div>
              <div className="subcategory-grid" role="group" aria-label={`${selectedCategoryDefinition.label} subcategories`}>
                {availableSubcategories.map((item) => <button key={item.label} className={subcategory === item.label ? "selected" : ""} type="button" aria-pressed={subcategory === item.label} onClick={() => setSubcategory((current) => current === item.label ? undefined : item.label)}><ServiceGlyph name={item.icon} size={16} /><span>{item.label}</span></button>)}
              </div>
            </section>}
            <div className="filter-heading"><span>Fine tune</span><Filter size={15} /></div>
            <div className="filter-controls"><label><span>Within</span><select value={maxDistanceMiles} onChange={(event) => setMaxDistanceMiles(Number(event.target.value))}><option value={1}>1 mile</option><option value={2}>2 miles</option><option value={3}>3 miles</option></select></label><label><span>Rating</span><select value={minimumRating} onChange={(event) => setMinimumRating(Number(event.target.value))}><option value={0}>Any rating</option><option value={4.5}>4.5+ stars</option><option value={4.8}>4.8+ stars</option></select></label><label className="check-row"><input type="checkbox" checked={availableNow} onChange={(event) => setAvailableNow(event.target.checked)} /><span>Available now</span></label></div>
            <div className="create-actions">
              <button className="offer-button" type="button" disabled={ratingBlocked} onClick={() => ratingBlocked ? openActiveRequest() : setCreateOpen(true)}><Plus size={17} /> {ratingBlocked ? "Rate before posting" : "Post a request"}</button>
              <button className="business-button" type="button" onClick={() => setBusinessModal("sponsor")}><Store size={17} /><span><strong>List a business</strong><small>Permanent sponsored pin</small></span><ChevronRight size={16} /></button>
            </div>
            <div className="nearby-list" aria-label="Nearby listings">
              <div className="nearby-list-heading"><span>Nearby</span><small>{presentedServices.length} found</small></div>
              {presentedServices.map((service) => <button className={selected?.id === service.id ? "selected" : ""} type="button" key={service.id} onClick={() => selectService(service.id)}><span className="nearby-avatar" style={{ background: service.accent }}>{service.provider.initials}</span><span><strong>{service.title}</strong><small>{service.listingKind === "permanent" ? "Permanent pin" : service.price} · {service.distanceMiles.toFixed(1)} mi</small></span><ChevronRight size={14} /></button>)}
            </div>
          </aside>
          <section className="map-stage" aria-label="Campus listings map">
            {surfaceMode === "loading" ? <div className="map-loading" role="status"><span className="map-loading-mark" /><span>Loading approximate campus signals…</span></div> : surfaceMode === "offline" ? <div className="map-fallback" role="alert"><ShieldCheck size={25} /><h2>Listings are unavailable.</h2><p>Your filters are safe. Reconnect and try again; no precise location was requested.</p><button className="secondary-button" type="button" onClick={() => { setSurfaceMode("loading"); setQuery((value) => `${value} `); }}>Try again</button></div> : <CampusMap services={presentedServices} selectedId={pinOpen ? selected?.id : undefined} recenterKey={recenterKey} onSelect={selectService} popupContent={pinOpen && selected ? <aside className="service-inspector floating-inspector" aria-label="Selected listing" onKeyDown={(event) => { if (event.key === "Escape") setPinOpen(false); }}><button className="listing-close" type="button" aria-label="Close listing" onClick={() => setPinOpen(false)}><X size={18} /></button><ServicePeek service={selected} onRequest={openSelectedRequest} onBusiness={() => setBusinessModal(selected)} requestDisabled={ratingBlocked} /></aside> : null} />}
            <div className="map-status"><span className="live-dot" /> {presentedServices.length} {presentedServices.length === 1 ? "match" : "matches"}</div>
            <button className="locate-button" type="button" aria-label="Recenter map" onClick={() => setRecenterKey((value) => value + 1)}><LocateFixed size={17} /><span className="locate-label">Recenter</span></button>
            {surfaceMode !== "loading" && surfaceMode !== "offline" && !selected && <EmptyState onReset={() => { resetFilters(); setSurfaceMode("default"); }} />}
          </section>

        </section>
      </section>}

      {view === "requests" && <RequestsView requests={requests} onBack={() => setView("discover")} onOpen={(request) => { applyRequestProjection(request); setRequestOpen(true); }} />}
      {view === "profile" && <ProfileView profile={profile} requests={requests} reviews={reviews} reviewsStatus={reviewsStatus} previewMode={dataMode === "preview"} onProfileChange={setProfile} onBack={() => setView("discover")} onSettings={() => setSettingsOpen(true)} />}
      {requestOpen && drawerService && <RequestDrawer key={activeRequestId ?? drawerService.id} selected={drawerService} stage={stage} role={currentRequest?.role ?? "requester"} setStage={transition} onBeginRequest={beginRequest} onAcceptRequest={acceptRequest} onRejectRequest={rejectRequest} onCancelRequest={cancelRequest} onStartMeeting={startMeeting} onCompleteService={completeService} onSubmitRating={rateService} actionBusy={actionBusy} requesterShared={requesterShared} setRequesterShared={setMyLocation} providerShared={providerShared} requesterCompleted={requesterCompleted} providerCompleted={providerCompleted} requesterRating={requesterRating} setRequesterRating={setRequesterRating} ratingComment={ratingComment} setRatingComment={setRatingComment} otherRatingSubmitted={otherRatingSubmitted} ratingSubmitted={dataMode === "live" && Boolean(currentRequest?.ratings.mine)} exactLocationVisible={exactLocationVisible} directionsUrl={directionsUrl} messages={messages} messagesLoading={messagesLoading} chatError={chatError} chatConnection={chatConnection} onRetryMessages={retryMessages} message={message} setMessage={setMessage} sendMessage={sendMessage} onClose={() => setRequestOpen(false)} closeRef={drawerCloseRef} />}
      {createOpen && <CreateServiceModal draft={serviceDraft} setDraft={setServiceDraft} reviewed={draftReviewed} setReviewed={setDraftReviewed} assistantBusy={assistantBusy} assistantSource={assistantSource} assistantError={assistantError} onAssistant={useWritingAssistant} onSubmit={publishService} onClose={() => setCreateOpen(false)} />}
      {businessModal && <BusinessPinModal service={businessModal === "sponsor" ? undefined : businessModal} onClose={() => setBusinessModal(null)} />}
      {settingsOpen && <SettingsModal requests={requests} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function CategoryRail({ activeCategory, listingFilter, services, onCategory, onListingFilter }: { activeCategory: ServiceCategory | "All"; listingFilter: ListingFilter; services: Service[]; onCategory: (category: ServiceCategory | "All") => void; onListingFilter: (kind: ListingFilter) => void }) {
  return <div className="discovery-toolbar" aria-label="Discovery categories">
    <div className="listing-switch" role="group" aria-label="Listing duration">
      <button type="button" aria-pressed={listingFilter === "all"} onClick={() => onListingFilter("all")}>Everything</button>
      <button type="button" aria-pressed={listingFilter === "temporary"} onClick={() => onListingFilter("temporary")}><Clock3 size={14} /> Now & soon</button>
      <button type="button" aria-pressed={listingFilter === "permanent"} onClick={() => onListingFilter("permanent")}><Store size={14} /> Permanent pins</button>
    </div>
    <div className="category-rail" role="group" aria-label="Browse all categories">
      <button type="button" className={activeCategory === "All" ? "selected" : ""} aria-pressed={activeCategory === "All"} onClick={() => onCategory("All")}><span><LayoutGrid size={23} strokeWidth={1.7} /></span><strong>All</strong><small>{services.length}</small></button>
      {CATEGORY_CATALOG.map((item) => <button type="button" key={item.id} className={activeCategory === item.id ? "selected" : ""} aria-pressed={activeCategory === item.id} onClick={() => onCategory(item.id)} style={{ "--category-accent": item.accent } as CSSProperties}><span><ServiceGlyph name={item.icon} size={23} /></span><strong>{item.shortLabel}</strong><small>{services.filter((service) => service.category === item.id).length || "Explore"}</small>{item.listingKind === "permanent" && <i>Sponsored</i>}</button>)}
    </div>
  </div>;
}

function ServicePeek({ service, onRequest, onBusiness, requestDisabled }: { service: Service; onRequest: () => void; onBusiness: () => void; requestDisabled: boolean }) {
  const permanent = service.listingKind === "permanent";
  const definition = categoryDefinition(service.category);
  return (
    <article className={`service-peek ${permanent ? "is-permanent" : "is-temporary"}`}>
      <div className="inspector-signal" aria-hidden="true"><i /><i /><i /></div>
      <div className="service-peek-mark" style={{ background: service.accent }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- avatar URLs are user data, not static assets */}
        {service.provider.avatarUrl ? <img className="provider-avatar-image" src={service.provider.avatarUrl} alt={`${service.provider.name}'s avatar`} /> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" role="img" aria-label={`${service.provider.name}'s avatar placeholder`}><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>}
      </div>
      <div className="service-peek-main">
      <div className="service-peek-top"><span>{definition.label}</span><span><MapPin size={13} /> {service.distanceMiles.toFixed(1)} mi</span></div>
      <div className={`listing-badge ${permanent ? "permanent" : "temporary"}`}>{permanent ? <><Store size={13} /> Sponsored · permanent</> : <><Clock3 size={13} /> Temporary request</>}</div>
      <h2>{service.title}</h2>
      <p>{service.description}</p>
      {service.subcategory && <div className="subcategory-label"><ServiceGlyph name={definition.subcategories.find((item) => item.label === service.subcategory)?.icon ?? definition.icon} size={14} /> {service.subcategory}</div>}
      <div className="service-tags">{service.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="provider-line"><strong>{service.provider.name}</strong>{service.provider.verified && <BadgeCheck size={14} />}{service.provider.ratingCount > 0 && <span><Star size={13} fill="currentColor" /> {service.provider.rating} ({service.provider.ratingCount})</span>}</div>
      <div className="inspector-fact"><Clock3 size={15} /><span><small>{permanent ? "Hours" : "When"}</small><strong>{service.availability}</strong></span></div>
      <div className="inspector-fact"><ShieldCheck size={15} /><span><small>Location</small><strong>{permanent ? "Public only after business review" : "Approximate zone until mutual consent"}</strong></span></div>
      </div>
      <div className="service-peek-action"><strong>{service.price}</strong><button type="button" onClick={permanent ? onBusiness : onRequest} disabled={!permanent && requestDisabled}>
        {!permanent && requestDisabled ? "Rate first" : permanent ? "Business details" : "Volunteer to help"}<ChevronRight size={16} />
      </button></div>
    </article>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Search size={22} /></span><h2>Nothing matches yet.</h2><p>Try another category, widen the radius, or remove a filter.</p><button className="secondary-button" type="button" onClick={onReset}>Reset filters</button></div>;
}

function RequestsView({ requests, onBack, onOpen }: { requests: ServiceRequestSummary[]; onBack: () => void; onOpen: (request: ServiceRequestSummary) => void }) {
  const [tab, setTab] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const isHistory = (request: ServiceRequestSummary) => ["closed", "rejected", "cancelled"].includes(request.status);
  const visible = requests.filter((request) => isHistory(request) === (tab === "history"))
    .filter((request) => `${request.otherParty.name} ${request.service.title}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <section className="inbox-page" aria-label="Messages and requests">
      <header className="inbox-header"><h1>Messages</h1><button className="text-button" type="button" onClick={onBack}>Discover <ArrowRight size={16} /></button></header>
      <div className="inbox-tools">
        <div className="request-tabs" role="group" aria-label="Request groups">
          <button type="button" aria-pressed={tab === "active"} onClick={() => setTab("active")}>Active <span>{requests.filter((request) => !isHistory(request)).length}</span></button>
          <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}>History <span>{requests.filter(isHistory).length}</span></button>
        </div>
        <label className="inbox-search"><Search size={17} /><input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="conversation-list">
        {visible.map((request) => <button className="conversation-row" type="button" key={request.id} onClick={() => onOpen(request)}>
          <span className="conversation-avatar">{request.otherParty.initials}</span>
          <span className="conversation-copy"><strong>{request.otherParty.name}</strong><span>{request.service.title}</span><small>{STAGE_LABEL[request.status]}</small></span>
          <span className="conversation-meta"><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><ChevronRight size={18} /></span>
        </button>)}
        {!visible.length && <div className="inbox-empty"><MessageCircle size={30} /><h2>{search ? "No matching conversations" : tab === "active" ? "No conversations yet" : "No past conversations"}</h2>{!search && tab === "active" && <button className="secondary-button" type="button" onClick={onBack}>Explore requests</button>}</div>}
      </div>
    </section>
  );
}

function formatProfileDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function ProfileView({ profile, requests, reviews, reviewsStatus, previewMode, onProfileChange, onBack, onSettings }: { profile: ProfileProjection | null; requests: ServiceRequestSummary[]; reviews: ProfileReview[]; reviewsStatus: "loading" | "ready" | "error"; previewMode: boolean; onProfileChange: (profile: ProfileProjection | null) => void; onBack: () => void; onSettings: () => void }) {
  const displayName = profile?.displayName || "Your profile";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", bio: "", interests: "" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const activityGroups = useMemo(() => groupProfileActivity(requests), [requests]);
  const providedCount = useMemo(() => providedServiceCount(requests), [requests]);

  function beginEdit() {
    if (!profile) return;
    setDraft({ displayName: profile.displayName === "Student" ? "" : profile.displayName, bio: profile.bio ?? "", interests: profile.interests.join(", ") });
    setSaveStatus("idle");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveStatus("idle");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const displayName = draft.displayName.trim();
    const interests = draft.interests.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
    if (displayName.length < 2 || displayName.length > 60 || draft.bio.trim().length > 320 || interests.some((item) => item.length > 50)) return;
    const next = { ...profile, displayName, bio: draft.bio.trim() || null, interests };
    if (previewMode) {
      onProfileChange(next);
      setEditing(false);
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    try {
      const result = await updateProfile({ displayName, bio: next.bio, interests });
      if (!result.updated) throw new ApiError("The profile update was not confirmed.", 502, "invalid_response");
      onProfileChange(next);
      setEditing(false);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <section className="secondary-view profile-view">
      <div className="secondary-inner wide-inner">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} /> Discover</button>

        <div className="profile-heading profile-identity-heading">
          <ProfileAvatarLink previewMode={previewMode} />
          <div className="profile-title-block"><p className="eyebrow">YOUR PROFILE</p><div className="profile-name-line"><h1>{displayName}</h1>{profile && <span className="verified-profile-badge"><BadgeCheck size={14} /> University verified</span>}</div><p className="secondary-lede">{profile?.eduDomain ? `Verified through ${profile.eduDomain}` : "Loading your verified profile…"}</p></div>
          <div className="profile-heading-actions"><button className="secondary-button" type="button" disabled={!profile} onClick={beginEdit}><Pencil size={15} /> Edit profile</button><button className="secondary-button" type="button" onClick={onSettings}><Settings2 size={15} /> Settings</button></div>
        </div>

        <div className="profile-stats" aria-label="Profile stats">
          <div><strong>{profile?.completedCount ?? "—"}</strong><span>Completed</span></div>
          <div><strong>{providedCount}</strong><span>Provided</span></div>
          <div><strong>{profile?.rating == null ? "—" : profile.rating.toFixed(1)}</strong><span>{profile?.ratingCount === 1 ? "1 review" : `${profile?.ratingCount ?? 0} reviews`}</span></div>
        </div>

        {editing && <form className="profile-details-form" onSubmit={saveProfile} noValidate>
          <div className="section-heading"><div><span className="section-kicker">PROFILE DETAILS</span><h2>What you choose to share.</h2></div><LockKeyhole size={20} /></div>
          <label>Display name<input autoFocus required minLength={2} maxLength={60} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label>About<textarea rows={4} maxLength={320} value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} placeholder="A short introduction for students you work with" /><small>{draft.bio.length}/320</small></label>
          <label>Interests <span>Separate with commas</span><input maxLength={1019} value={draft.interests} onChange={(event) => setDraft((current) => ({ ...current, interests: event.target.value }))} placeholder="Tutoring, Python, photography" /></label>
          <p><ShieldCheck size={15} /> Your email, Auth0 ID, wallet, and exact location are never shown here.</p>
          <div className="profile-form-actions"><button className="secondary-button" type="button" onClick={cancelEdit}>Cancel</button><button className="primary-action" type="submit" disabled={draft.displayName.trim().length < 2 || saveStatus === "saving"}>{saveStatus === "saving" ? "Saving…" : previewMode ? "Save in this preview" : "Save profile"}</button></div>
        </form>}
        {saveStatus === "saved" && <p className="profile-save-status" role="status">{previewMode ? "Updated in this local preview only." : "Profile updated."}</p>}
        {saveStatus === "error" && <p className="profile-save-status is-error" role="alert">The profile could not be saved. Your previous details are unchanged.</p>}

        <div className="profile-experience-grid">
          <div className="profile-main-column">
            <section className="profile-card profile-about">
              <div className="section-heading"><div><span className="section-kicker">ABOUT</span><h2>A little context.</h2></div></div>
              <p className="profile-bio">{profile?.bio || "Add a short introduction so students know how you like to help or what you are looking for."}</p>
              {profile?.interests.length ? <div className="profile-interest-list">{profile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div> : <p className="profile-empty-copy">No interests shared yet.</p>}
            </section>

            <section className="profile-card profile-activity" aria-labelledby="activity-heading">
              <div className="section-heading"><div><span className="section-kicker">ACTIVITY</span><h2 id="activity-heading">Your service history.</h2></div><CalendarDays size={20} /></div>
              {activityGroups.length ? activityGroups.map((group) => <div className="profile-activity-group" key={group.id}><h3>{group.label}</h3><div>{group.items.map((request) => <article className="profile-activity-item" key={request.id}><span className={`activity-role role-${request.role}`}>{profileActivityRoleLabel(request.role)}</span><div><strong>{request.service.title}</strong><small>With {request.otherParty.name} · {formatProfileDate(profileActivityDate(request))}</small></div><span className={`stage-pill stage-${request.status}`}>{STAGE_LABEL[request.status]}</span></article>)}</div></div>) : <div className="profile-empty-state"><CalendarDays size={20} /><strong>No service activity yet.</strong><p>Your own requests and services you provide will appear here.</p></div>}
            </section>

            <section className="profile-card profile-reviews" aria-labelledby="reviews-heading">
              <div className="section-heading"><div><span className="section-kicker">REVIEWS RECEIVED</span><h2 id="reviews-heading">Private to your profile view.</h2></div><Star size={20} /></div>
              {reviewsStatus === "loading" && <p className="profile-empty-copy" role="status">Loading your reviews…</p>}
              {reviewsStatus === "error" && <p className="profile-empty-copy is-error" role="alert">Reviews could not be loaded. No other profile data was exposed.</p>}
              {reviewsStatus === "ready" && reviews.length === 0 && <div className="profile-empty-state"><Star size={20} /><strong>No reviews received yet.</strong><p>Written notes appear only after both participants submit ratings and the service closes.</p></div>}
              {reviewsStatus === "ready" && reviews.length > 0 && <div className="profile-review-list">{reviews.map((review) => <article className="profile-review" key={review.id}><header><span>{review.author.initials}</span><div><strong>{review.author.name}</strong><small aria-label={`${review.score} out of 5 stars`}>{"★".repeat(review.score)}{"☆".repeat(5 - review.score)}</small></div></header><blockquote>{review.comment || "Rating submitted without a written note."}</blockquote><footer>{review.service.title} · {formatProfileDate(review.createdAt)}</footer></article>)}</div>}
            </section>
          </div>

        </div>

      </div>
    </section>
  );
}
function RequestDrawer({ selected, stage, role, setStage, onBeginRequest, onAcceptRequest, onRejectRequest, onCancelRequest, onStartMeeting, onCompleteService, onSubmitRating, actionBusy, requesterShared, setRequesterShared, providerShared, requesterCompleted, providerCompleted, requesterRating, setRequesterRating, ratingComment, setRatingComment, otherRatingSubmitted, ratingSubmitted, exactLocationVisible, directionsUrl, messages, messagesLoading, chatError, chatConnection, onRetryMessages, message, setMessage, sendMessage, onClose, closeRef }: { selected: Service; stage: RequestStage; role: ServiceRequestSummary["role"]; setStage: (stage: RequestStage) => void; onBeginRequest: () => void; onAcceptRequest: () => void; onRejectRequest: () => void; onCancelRequest: () => void; onStartMeeting: () => void; onCompleteService: () => void; onSubmitRating: () => void; actionBusy: boolean; requesterShared: boolean; setRequesterShared: (value: boolean) => void; providerShared: boolean; requesterCompleted: boolean; providerCompleted: boolean; requesterRating: number; setRequesterRating: (value: number) => void; ratingComment: string; setRatingComment: (value: string) => void; otherRatingSubmitted: boolean; ratingSubmitted: boolean; exactLocationVisible: boolean; directionsUrl: (mode: "walking" | "driving") => string | undefined; messages: RequestMessage[]; messagesLoading: boolean; chatError: string; chatConnection: ChatConnection; onRetryMessages: () => void; message: string; setMessage: (value: string) => void; sendMessage: () => void; onClose: () => void; closeRef: RefObject<HTMLButtonElement | null> }) {
  const walkingUrl = directionsUrl("walking");
  const drivingUrl = directionsUrl("driving");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(messages.length);
  const [atChatBottom, setAtChatBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const chatAvailable = ["requested", "accepted", "meeting", "completion_pending"].includes(stage);

  useEffect(() => {
    const added = Math.max(0, messages.length - previousMessageCount.current);
    previousMessageCount.current = messages.length;
    const frame = window.requestAnimationFrame(() => {
      if (atChatBottom) {
        messagesEndRef.current?.scrollIntoView({ block: "nearest", behavior: currentChatScrollBehavior() });
        setNewMessageCount(0);
      } else if (added) {
        setNewMessageCount((current) => current + added);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [atChatBottom, messages.length]);

  function scrollToLatest() {
    messagesEndRef.current?.scrollIntoView({ block: "nearest", behavior: currentChatScrollBehavior() });
    setAtChatBottom(true);
    setNewMessageCount(0);
  }

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="request-drawer" role="dialog" aria-modal="true" aria-labelledby="request-title" onKeyDown={trapDialogFocus}>
        <div className="drawer-header">
          <div><span className="drawer-kicker">SERVICE REQUEST</span><h2 id="request-title">{selected.title}</h2></div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Close request" onClick={onClose}><X size={19} /></button>
        </div>

        <div className="request-summary">
          <div className="provider-avatar" style={{ background: selected.accent }}>{selected.provider.initials}</div>
          <div><strong>{selected.provider.name}</strong><span><Star size={13} fill="currentColor" /> {selected.provider.ratingCount ? `${selected.provider.rating} · ${selected.provider.completed} completed` : "New member"}</span></div>
          <span className={`stage-pill stage-${stage}`}>{STAGE_LABEL[stage]}</span>
        </div>

        {stage === "idle" && (
          <section className="drawer-section request-intro">
            <div><Clock3 size={18} /><span><strong>{selected.availability}</strong><small>Propose a time in your first message.</small></span></div>
            <div><MapPin size={18} /><span><strong>Approximate area only</strong><small>No exact point is delivered to discovery.</small></span></div>
            <div><CircleDollarSign size={18} /><span><strong>{selected.price}</strong><small>Payment happens directly between students.</small></span></div>
            <label className="request-message-label">How can you help?<textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Hi! I can help with this. Here is when I am available…" /></label>
            <button className="primary-action" type="button" disabled={actionBusy} onClick={onBeginRequest}>{actionBusy ? "Sending…" : "Volunteer to help"} <Send size={16} /></button>
          </section>
        )}

        {stage !== "idle" && (
          <section className="drawer-section chat-section">
            <div className="section-title"><span>PRIVATE CHAT</span><small className={`chat-presence chat-${chatConnection}`}><i />{chatConnection === "preview" ? "Preview" : chatConnection === "online" ? "Live" : chatConnection === "connecting" ? "Connecting" : "Reconnecting"}</small></div>
            <div className="messages" aria-live="polite" onScroll={(event) => { const element = event.currentTarget; const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 28; setAtChatBottom(bottom); if (bottom) setNewMessageCount(0); }}>
              {messagesLoading && !messages.length ? <div className="chat-loading" role="status"><span className="map-loading-mark" /> Loading conversation…</div> : chatError && !messages.length ? <div className="chat-error" role="alert"><TriangleAlert size={17} /><span>{chatError}</span><button type="button" onClick={onRetryMessages}>Try again</button></div> : messages.length ? messages.map((item) => <div className={`message-line ${item.isMine ? "mine" : "theirs"}`} key={item.id}><span className="chat-avatar">{item.isMine ? "YOU" : selected.provider.initials}</span><div><p>{item.body}</p><time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time></div></div>) : <p className="empty-chat">{chatAvailable ? "No messages yet. Say hello to start the conversation." : "No messages in this conversation."}</p>}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
            {newMessageCount > 0 && <button className="new-message-button" type="button" onClick={scrollToLatest}>{newMessageCount} new {newMessageCount === 1 ? "message" : "messages"} <ChevronRight size={14} /></button>}
            {chatAvailable ? <div className="message-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder="Write a message" aria-label="Message" /><button type="button" onClick={sendMessage} disabled={!message.trim() || actionBusy} aria-label="Send message"><Send size={16} /></button></div> : <p className="chat-readonly">This conversation is read-only.</p>}
          </section>
        )}

        {stage === "requested" && role === "requester" && (
          <>
            <section className="drawer-section pending-state"><Clock3 size={20} /><div><strong>Waiting for the provider</strong><p>Your exact location is still private. You can cancel before acceptance.</p></div></section>
            <button className="revoke-button request-cancel" type="button" disabled={actionBusy} onClick={onCancelRequest}>Cancel my request</button>
          </>
        )}

        {stage === "requested" && role === "provider" && (
          <section className="drawer-section incoming-request">
            <div className="pending-state"><MessageCircle size={20} /><div><strong>New request from {selected.provider.name}</strong><p>Chat first if you need to clarify scope. Accept only when the time and task work for you.</p></div></div>
            <div className="incoming-actions"><button className="secondary-button" type="button" disabled={actionBusy} onClick={onRejectRequest}>Decline</button><button className="primary-action" type="button" disabled={actionBusy} onClick={onAcceptRequest}>{actionBusy ? "Updating…" : "Accept request"}<Check size={16} /></button></div>
          </section>
        )}

        {["accepted", "meeting"].includes(stage) && (
          <section className="drawer-section location-section">
            <div className="section-title"><span>MEETING LOCATION</span><small>{exactLocationVisible ? "Mutually shared" : "Exact point hidden"}</small></div>
            <label><input type="checkbox" checked={requesterShared} disabled={actionBusy} onChange={(event) => setRequesterShared(event.target.checked)} /><span>Share my exact location for this service</span></label>
            <div className="participant-state"><span>{selected.provider.name}</span><strong>{providerShared ? "Sharing with you" : "Not sharing"}</strong></div>
            <div className={`location-lock ${exactLocationVisible ? "unlocked" : ""}`}>{exactLocationVisible ? <Navigation size={19} /> : <LockKeyhole size={19} />}<div><strong>{exactLocationVisible ? "Private meeting point available" : "Waiting for both choices"}</strong><p>{exactLocationVisible ? "Visible only inside this active request. Sharing expires at completion." : "The discovery map stays approximate."}</p></div></div>
            {exactLocationVisible && (
              <>
                <ExactDirections walkingUrl={walkingUrl} drivingUrl={drivingUrl} />
                <button className="revoke-button" type="button" onClick={() => setRequesterShared(false)}>Stop sharing my location</button>
              </>
            )}
            {stage === "accepted" && <button className="primary-action" type="button" disabled={!exactLocationVisible || actionBusy} onClick={onStartMeeting}>Start the service</button>}
            {stage === "meeting" && <button className="primary-action" type="button" disabled={actionBusy} onClick={onCompleteService}>Service is done</button>}
            <button className="revoke-button request-cancel" type="button" disabled={actionBusy} onClick={onCancelRequest}>Cancel this service</button>
          </section>
        )}

        {stage === "completion_pending" && (
          <section className="drawer-section completion-section">
            <div className="section-title"><span>DOUBLE CONFIRMATION</span><small>Location sharing expired</small></div>
            <div className="participant-state"><span>Your confirmation</span><strong>{requesterCompleted ? "Confirmed" : "Required"}</strong></div>
            <div className="participant-state"><span>{selected.provider.name}</span><strong>{providerCompleted ? "Confirmed" : "Waiting"}</strong></div>
            {requesterCompleted && !providerCompleted && <p className="conditional-note"><Clock3 size={14} /> Waiting for the other student. The timeout or dispute policy is not yet defined.</p>}
            {!requesterCompleted && <button className="primary-action" type="button" disabled={actionBusy} onClick={onCompleteService}>Confirm completion <Check size={16} /></button>}
            {requesterCompleted && providerCompleted && <button className="primary-action" type="button" onClick={() => setStage("rating_pending")}>Continue to required rating <ChevronRight size={16} /></button>}
          </section>
        )}

        {stage === "rating_pending" && (
          <section className="drawer-section rating-section">
            <div className="section-title"><span>REQUIRED RATINGS</span><small>New service activity is locked</small></div>
            <RatingRow label={`Rate ${selected.provider.name}`} value={requesterRating} onChange={setRequesterRating} />
            <label className="rating-comment">Optional private review<textarea rows={3} maxLength={500} value={ratingComment} disabled={ratingSubmitted} onChange={(event) => setRatingComment(event.target.value)} placeholder="Share useful, respectful feedback" /><small>{ratingComment.length}/500 · Shown only to the reviewed student after both ratings are submitted.</small></label>
            <div className="participant-state"><span>Rating from {selected.provider.name}</span><strong>{otherRatingSubmitted ? "Submitted" : "Waiting"}</strong></div>
            <button className="primary-action" type="button" disabled={requesterRating < 1 || actionBusy || ratingSubmitted} onClick={onSubmitRating}>{ratingSubmitted ? "Rating submitted · waiting" : "Submit my rating"} <Check size={16} /></button>
          </section>
        )}

        {["rejected", "cancelled"].includes(stage) && <section className="drawer-section terminal-section"><X size={24} /><h3>{stage === "rejected" ? "Request declined" : "Request cancelled"}</h3><p>No exact location was shared. You can return to discovery and choose another service.</p><button className="secondary-button" type="button" onClick={onClose}>Back to map</button></section>}
        {stage === "closed" && <section className="drawer-section success-section"><span className="success-mark"><Check size={25} /></span><h3>Service complete</h3><p>Both ratings are complete. New service activity is unlocked.</p><button className="secondary-button" type="button" onClick={onClose}>Back to map</button></section>}
      </aside>
    </div>
  );
}

function ExactDirections({ walkingUrl, drivingUrl }: { walkingUrl?: string; drivingUrl?: string }) {
  const [consented, setConsented] = useState(false);
  return (
    <>
      <label className="third-party-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I understand that opening directions sends this exact point to Google Maps.</span></label>
      <div className="direction-actions">
        {walkingUrl && consented ? <a href={walkingUrl} target="_blank" rel="noreferrer"><Bike size={16} /> Open walking route</a> : <button type="button" disabled><Bike size={16} /> {walkingUrl ? "Confirm Google sharing" : "Walking route unavailable"}</button>}
        {drivingUrl && consented ? <a href={drivingUrl} target="_blank" rel="noreferrer"><Car size={16} /> Open driving route</a> : <button type="button" disabled><Car size={16} /> {drivingUrl ? "Confirm Google sharing" : "Driving route unavailable"}</button>}
      </div>
    </>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (rating: number) => void }) {
  return <div className="rating-row"><div><strong>{label}</strong></div><div className="stars" aria-label={`${label}: ${value} out of 5`}>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => onChange(star)} aria-label={`${star} stars`}><Star size={20} fill={star <= value ? "currentColor" : "none"} /></button>)}</div></div>;
}

function BusinessPinModal({ service, onClose }: { service?: Service; onClose: () => void }) {
  const definition = service ? categoryDefinition(service.category) : categoryDefinition("Businesses");
  return <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="business-modal" role="dialog" aria-modal="true" aria-labelledby="business-pin-title" onKeyDown={trapDialogFocus}>
      <div className="drawer-header"><div><span className="drawer-kicker">SPONSORED · PERMANENT</span><h2 id="business-pin-title">{service ? service.title : "A lasting place on the campus map."}</h2></div><button className="icon-button" type="button" aria-label="Close business information" autoFocus onClick={onClose}><X size={19} /></button></div>
      {service ? <>
        <div className="business-identity"><span style={{ background: definition.accent }}><ServiceGlyph name={definition.icon} size={23} /></span><div><strong>{service.provider.name}</strong><small>{service.subcategory} · {service.distanceMiles.toFixed(1)} mi away</small></div></div>
        <p className="modal-copy">{service.description}</p>
        <div className="business-facts"><div><Clock3 size={17} /><span><small>Hours</small><strong>{service.availability}</strong></span></div><div><MapPin size={17} /><span><small>Placement</small><strong>Permanent reviewed map pin</strong></span></div></div>
      </> : <>
        <p className="modal-copy">Businesses do not enter the temporary student feed. They apply for a reviewed, paid placement that remains clearly labelled as sponsored.</p>
        <ol className="sponsor-steps"><li><span>1</span><div><strong>Apply</strong><p>Share the business, category, location, and student value.</p></div></li><li><span>2</span><div><strong>Review</strong><p>We verify identity, relevance, safety, and listing quality.</p></div></li><li><span>3</span><div><strong>Sponsor</strong><p>Approved businesses complete the configured payment before publication.</p></div></li></ol>
      </>}
      <div className="sponsor-disclosure"><BadgeDollarSign size={19} /><div><strong>Paid placement, never disguised.</strong><p>Sponsorship buys a permanent directory pin—not student endorsement or automatic top ranking. Pricing and checkout are not connected yet.</p></div></div>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Close</button>{!service && <button className="primary-action" type="button" disabled>Checkout not connected</button>}</div>
    </section>
  </div>;
}

type ServiceDraft = { title: string; category: ServiceCategory; subcategory: string; availability: string; description: string; price: string };

function CreateServiceModal({ draft, setDraft, reviewed, setReviewed, assistantBusy, assistantSource, assistantError, onAssistant, onSubmit, onClose }: { draft: ServiceDraft; setDraft: Dispatch<SetStateAction<ServiceDraft>>; reviewed: boolean; setReviewed: (value: boolean) => void; assistantBusy: boolean; assistantSource?: "gemini" | "deterministic-fallback" | "template"; assistantError: string; onAssistant: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const [attempted, setAttempted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = Object.values(draft).some(Boolean);
  const valid = Boolean(draft.title.trim() && draft.description.trim() && draft.availability.trim() && reviewed);

  function requestClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) requestClose(); }}>
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title" onKeyDown={trapDialogFocus}>
        <div className="drawer-header"><div><span className="drawer-kicker">TEMPORARY REQUEST</span><h2 id="create-title">What do you need?</h2></div><button className="icon-button" type="button" aria-label="Close service form" autoFocus onClick={requestClose}><X size={19} /></button></div>
        <p className="modal-copy">Post what you need. Nearby students can volunteer to help.</p>
        <form className="service-form" onSubmit={(event) => { setAttempted(true); if (valid) onSubmit(event); else event.preventDefault(); }} noValidate>
          <label>Title <span aria-hidden="true">*</span><input aria-invalid={attempted && !draft.title.trim()} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="I need help debugging my Python assignment" />{attempted && !draft.title.trim() && <small className="field-error">Describe what you need.</small>}</label>
          <div className="form-row"><label>Category<select value={draft.category} onChange={(event) => { const next = event.target.value as ServiceCategory; setDraft((current) => ({ ...current, category: next, subcategory: subcategoriesFor(next)[0].label })); }}>{CATEGORY_CATALOG.filter((item) => item.listingKind === "temporary").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Type<select value={draft.subcategory} onChange={(event) => setDraft((current) => ({ ...current, subcategory: event.target.value }))}>{subcategoriesFor(draft.category).map((item) => <option key={item.label}>{item.label}</option>)}</select></label></div>
          <label>Your budget (optional)<input value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} placeholder="Volunteer help or an agreed amount" /><small>Ask for volunteer help or set a budget.</small></label>
          <label>Availability <span aria-hidden="true">*</span><input aria-invalid={attempted && !draft.availability.trim()} value={draft.availability} onChange={(event) => setDraft((current) => ({ ...current, availability: event.target.value }))} placeholder="Today after 5 PM" />{attempted && !draft.availability.trim() && <small className="field-error">Say when you need help.</small>}</label>
          <label>Description <span aria-hidden="true">*</span><textarea aria-invalid={attempted && !draft.description.trim()} rows={4} maxLength={320} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="What do you need help with?" />{attempted && !draft.description.trim() && <small className="field-error">Describe the task and its boundary.</small>}</label>
          <div className="ai-helper"><div><Sparkles size={17} /><div><strong>{assistantSource === "gemini" ? "Gemini suggestion" : assistantSource === "deterministic-fallback" ? "Rule-based fallback" : assistantSource === "template" ? "Preview template" : "Writing assistant"}</strong><p>{assistantSource ? "Suggestion applied. Review every word before publishing." : "Refine the title and category without publishing automatically."}</p></div></div><button type="button" disabled={assistantBusy} onClick={onAssistant}>{assistantBusy ? "Reviewing…" : "Suggest"}</button></div>
          {assistantError && <p className="form-error" role="alert">{assistantError}</p>}
          <label className="review-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed the title, scope and availability.</span></label>
          {attempted && !reviewed && <p className="form-error" role="alert">Review and confirm your request before publishing.</p>}
          {confirmDiscard && <div className="discard-confirm" role="alert"><span>Discard this draft?</span><button type="button" onClick={onClose}>Discard</button><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button></div>}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={requestClose}>Cancel</button><button className="primary-action" type="submit" disabled={!valid}>Post request <Plus size={16} /></button></div>
        </form>
      </section>
    </div>
  );
}

function SettingsModal({ onClose, requests }: { onClose: () => void; requests: ServiceRequestSummary[] }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRequest, setReportRequest] = useState("");
  const [reportType, setReportType] = useState("Safety concern");
  const [reportDetails, setReportDetails] = useState("");
  const [draftOpened, setDraftOpened] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const contactButton = useRef<HTMLButtonElement>(null);
  const contactClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (contactOpen) contactClose.current?.focus();
  }, [contactOpen]);
  function backToSettings() {
    setContactOpen(false);
    requestAnimationFrame(() => contactButton.current?.focus());
  }
  if (contactOpen) return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) backToSettings(); }}>
      <section className="settings-modal contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); backToSettings(); } else trapDialogFocus(event); }}>
        <div className="drawer-header"><h2 id="contact-title">Contact us</h2><button ref={contactClose} className="icon-button" type="button" aria-label="Close contact window" onClick={backToSettings}><X size={19} /></button></div>
        <div className="settings-list">
          <div><span>Phone</span><a href="tel:+14696316840">(469) 631-6840</a></div>
          <div><span>Email</span><a href="mailto:RAPHIERAPHX@GMAIL.COM" style={{ overflowWrap: "anywhere" }}>RAPHIERAPHX@GMAIL.COM</a></div>
        </div>
        <button className="back-button" type="button" onClick={backToSettings}><ArrowLeft size={16} /> Back to settings</button>
      </section>
    </div>
  );
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={trapDialogFocus}>
        <div className="drawer-header"><div><span className="drawer-kicker">PRIVACY & SAFETY</span><h2 id="settings-title">Your boundaries.</h2></div><button className="icon-button" type="button" aria-label="Close settings" autoFocus onClick={onClose}><X size={19} /></button></div>
        <div className="settings-list">
          <div><span><BadgeCheck size={16} /> University verification</span><strong>Verified through Microsoft · public fields limited</strong></div>
          <div><span><LockKeyhole size={16} /> Discovery location</span><strong>Approximate service zones only</strong></div>
          <div><span><Navigation size={16} /> Exact location</span><strong>Off until accepted + mutual opt-in · expires at completion</strong></div>
          <div><span><Bell size={16} /> Notifications</span><strong>Requests, messages and service updates</strong></div>
        </div>
        <div className="safety-actions">
          <button ref={contactButton} type="button" onClick={() => setContactOpen(true)}>Contact us <ChevronRight size={15} /></button>
          <button type="button" onClick={() => setReportOpen(!reportOpen)}>Report a safety issue <ChevronRight size={15} /></button>
          <button type="button" disabled aria-disabled="true" title="Blocking controls are not available in this release">Blocked students <span>Coming soon</span><ChevronRight size={15} /></button>
        </div>
        {reportOpen && <form className="service-form" aria-label="Report a safety issue" onSubmit={(event) => {
          event.preventDefault();
          if (!reportDetails.trim()) return;
          const related = requests.find((request) => request.id === reportRequest);
          const body = `Issue: ${reportType}\nRelated request: ${related ? `${related.service.title} (${related.id})` : "Not related to a request"}\n\n${reportDetails.trim()}`;
          window.location.href = `mailto:RAPHIERAPHX@GMAIL.COM?subject=${encodeURIComponent(`HitMeUp report: ${reportType}`)}&body=${encodeURIComponent(body)}`;
          setDraftOpened(true);
        }}>
          <h3>Tell us what happened</h3>
          <label>Related request<select value={reportRequest} onChange={(event) => setReportRequest(event.target.value)}><option value="">Not related to a request</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.service.title} — {request.otherParty.name}</option>)}</select></label>
          <label>Issue type<select value={reportType} onChange={(event) => setReportType(event.target.value)}>{["Safety concern", "Harassment", "Scam or misleading listing", "No-show", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Details<textarea required maxLength={1500} rows={4} value={reportDetails} onChange={(event) => { setReportDetails(event.target.value); setDraftOpened(false); }} placeholder="Describe what happened. Avoid including sensitive personal details." /></label>
          <button className="primary-button" type="submit" disabled={!reportDetails.trim()}>Prepare report email</button>
          {draftOpened && <p role="status">Email draft requested—not sent yet. If your email app didn’t open, email your report to RAPHIERAPHX@GMAIL.COM.</p>}
        </form>}
        <div className="settings-footer"><a className="text-button" href="/auth/logout">Sign out</a><button className="secondary-button settings-done" type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
