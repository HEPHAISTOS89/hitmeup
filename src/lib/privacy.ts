import type { RequestStage } from "./types";

export function canRevealExactLocation(
  stage: RequestStage,
  requesterShared: boolean,
  providerShared: boolean,
) {
  const acceptedStages: RequestStage[] = [
    "accepted",
    "meeting",
  ];

  return (
    acceptedStages.includes(stage) && requesterShared && providerShared
  );
}

export function canCloseRequest(
  requesterCompleted: boolean,
  providerCompleted: boolean,
  requesterRated: boolean,
  providerRated: boolean,
) {
  return (
    requesterCompleted && providerCompleted && requesterRated && providerRated
  );
}
