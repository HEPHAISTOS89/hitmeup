export const SERVICE_CATEGORIES = [
  "Social",
  "Services",
  "Tutoring",
  "Jobs",
  "Volunteer",
  "Clubs",
  "Activities",
  "Events",
  "Businesses",
  "Help",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export type ListingKind = "temporary" | "permanent";

export type ServiceIconName =
  | "party"
  | "wrench"
  | "graduation"
  | "briefcase"
  | "heart"
  | "game"
  | "activity"
  | "ticket"
  | "store"
  | "help"
  | "users"
  | "trophy"
  | "food"
  | "sparkles"
  | "camera"
  | "scissors"
  | "laptop"
  | "cleaning"
  | "hammer"
  | "book"
  | "code"
  | "languages"
  | "calendar"
  | "money"
  | "clipboard"
  | "trash"
  | "donations"
  | "trees"
  | "megaphone"
  | "palette"
  | "music"
  | "chess"
  | "basketball"
  | "soccer"
  | "running"
  | "mountain"
  | "bike"
  | "games"
  | "workshop"
  | "microphone"
  | "shopping"
  | "promotion"
  | "coffee"
  | "charger"
  | "library"
  | "question";

export type SubcategoryDefinition = {
  label: string;
  icon: ServiceIconName;
};

export type CategoryDefinition = {
  id: ServiceCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: ServiceIconName;
  accent: string;
  listingKind: ListingKind;
  subcategories: readonly SubcategoryDefinition[];
};

export const CATEGORY_CATALOG: readonly CategoryDefinition[] = [
  {
    id: "Social",
    label: "Hit Me Up / Social",
    shortLabel: "HitMeUp",
    description: "Spontaneous plans with people nearby.",
    icon: "party",
    accent: "#e94d71",
    listingKind: "temporary",
    subcategories: [
      { label: "Parties", icon: "party" },
      { label: "Hangouts", icon: "users" },
      { label: "Pickup games", icon: "trophy" },
      { label: "Study groups", icon: "book" },
      { label: "Grab food", icon: "food" },
      { label: "Spontaneous plans", icon: "sparkles" },
    ],
  },
  {
    id: "Services",
    label: "Services",
    shortLabel: "Services",
    description: "Useful skills, free or paid, for one clear task.",
    icon: "wrench",
    accent: "#247f70",
    listingKind: "temporary",
    subcategories: [
      { label: "Moving help", icon: "help" },
      { label: "Photography", icon: "camera" },
      { label: "Hair & nails", icon: "scissors" },
      { label: "Tech help", icon: "laptop" },
      { label: "Cleaning", icon: "cleaning" },
      { label: "Furniture assembly", icon: "hammer" },
    ],
  },
  {
    id: "Tutoring",
    label: "Tutoring / Academic",
    shortLabel: "Tutoring",
    description: "Learn together without turning help into answer-selling.",
    icon: "graduation",
    accent: "#d79019",
    listingKind: "temporary",
    subcategories: [
      { label: "Tutoring", icon: "graduation" },
      { label: "Homework help", icon: "book" },
      { label: "Study sessions", icon: "users" },
      { label: "Exam prep", icon: "clipboard" },
      { label: "Coding help", icon: "code" },
      { label: "Languages", icon: "languages" },
    ],
  },
  {
    id: "Jobs",
    label: "Jobs / Gigs",
    shortLabel: "Jobs",
    description: "Short, specific, paid campus work.",
    icon: "briefcase",
    accent: "#356aa0",
    listingKind: "temporary",
    subcategories: [
      { label: "Event staffing", icon: "calendar" },
      { label: "Campus gigs", icon: "briefcase" },
      { label: "Paid help", icon: "money" },
      { label: "Creative gigs", icon: "camera" },
      { label: "Tech gigs", icon: "laptop" },
      { label: "Weekend work", icon: "clipboard" },
    ],
  },
  {
    id: "Volunteer",
    label: "Volunteer / Community",
    shortLabel: "Volunteer",
    description: "Show up for a shared cause or campus project.",
    icon: "heart",
    accent: "#bf5841",
    listingKind: "temporary",
    subcategories: [
      { label: "Cleanups", icon: "trash" },
      { label: "Donation drives", icon: "donations" },
      { label: "Charity events", icon: "heart" },
      { label: "Community projects", icon: "users" },
      { label: "Environment", icon: "trees" },
      { label: "Outreach", icon: "megaphone" },
    ],
  },
  {
    id: "Clubs",
    label: "Clubs & Hobbies",
    shortLabel: "Clubs",
    description: "Find people who are into the same thing.",
    icon: "game",
    accent: "#7557a8",
    listingKind: "temporary",
    subcategories: [
      { label: "Gaming", icon: "game" },
      { label: "Crochet & crafts", icon: "scissors" },
      { label: "Art", icon: "palette" },
      { label: "Coding", icon: "code" },
      { label: "Book clubs", icon: "book" },
      { label: "Music & jams", icon: "music" },
      { label: "Chess", icon: "chess" },
    ],
  },
  {
    id: "Activities",
    label: "Activities",
    shortLabel: "Activities",
    description: "Move, practice, or explore with company.",
    icon: "activity",
    accent: "#4b7f3a",
    listingKind: "temporary",
    subcategories: [
      { label: "Basketball", icon: "basketball" },
      { label: "Soccer", icon: "soccer" },
      { label: "Running", icon: "running" },
      { label: "Gym buddies", icon: "activity" },
      { label: "Hiking", icon: "mountain" },
      { label: "Cycling", icon: "bike" },
    ],
  },
  {
    id: "Events",
    label: "Events",
    shortLabel: "Events",
    description: "What is happening on and around campus.",
    icon: "ticket",
    accent: "#b64d84",
    listingKind: "temporary",
    subcategories: [
      { label: "Concerts", icon: "music" },
      { label: "Campus events", icon: "ticket" },
      { label: "Game nights", icon: "games" },
      { label: "Pop-ups", icon: "store" },
      { label: "Workshops", icon: "workshop" },
      { label: "Open mics", icon: "microphone" },
    ],
  },
  {
    id: "Businesses",
    label: "Businesses",
    shortLabel: "Businesses",
    description: "Reviewed, permanent campus-area pins with sponsorship disclosure.",
    icon: "store",
    accent: "#9a5c13",
    listingKind: "permanent",
    subcategories: [
      { label: "Restaurants", icon: "food" },
      { label: "Student businesses", icon: "store" },
      { label: "Shops", icon: "shopping" },
      { label: "Professional services", icon: "wrench" },
      { label: "Promotions", icon: "promotion" },
      { label: "Coffee & snacks", icon: "coffee" },
    ],
  },
  {
    id: "Help",
    label: "Help / Requests",
    shortLabel: "Help",
    description: "Small needs that someone nearby can solve quickly.",
    icon: "help",
    accent: "#d05e42",
    listingKind: "temporary",
    subcategories: [
      { label: "Borrow an item", icon: "charger" },
      { label: "Carry something", icon: "help" },
      { label: "Study company", icon: "library" },
      { label: "Quick ride", icon: "bike" },
      { label: "Find something", icon: "question" },
      { label: "Other request", icon: "sparkles" },
    ],
  },
] as const;

export function isServiceCategory(value: string): value is ServiceCategory {
  return SERVICE_CATEGORIES.includes(value as ServiceCategory);
}

export function categoryDefinition(category: ServiceCategory) {
  return CATEGORY_CATALOG.find((item) => item.id === category) ?? CATEGORY_CATALOG[1];
}

export function categoryAccent(category: ServiceCategory) {
  return categoryDefinition(category).accent;
}

export function subcategoriesFor(category: ServiceCategory) {
  return categoryDefinition(category).subcategories;
}
