import type { RequestStage } from "./types";

const TRANSITIONS: Record<RequestStage, RequestStage[]> = {
  idle: ["requested"],
  requested: ["accepted", "rejected", "cancelled"],
  accepted: ["meeting", "cancelled"],
  meeting: ["completion_pending", "cancelled"],
  completion_pending: ["rating_pending"],
  rating_pending: ["closed"],
  closed: ["idle"],
  rejected: ["idle"],
  cancelled: ["idle"],
};

export function canTransitionRequest(
  from: RequestStage,
  to: RequestStage,
): boolean {
  return TRANSITIONS[from].includes(to);
}
