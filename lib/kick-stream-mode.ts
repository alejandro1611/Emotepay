import type { KickStreamStatus } from "./kick-status";

export type KickStreamMode = "auto" | "live" | "offline";
export type KickAutoStatus = "loading" | KickStreamStatus;

export function normalizeKickStreamMode(value: string | undefined): KickStreamMode {
  return value === "auto" || value === "live" || value === "offline"
    ? value
    : "offline";
}

export function getResolvedKickStreamMode({
  configuredMode,
  autoStatus,
}: {
  configuredMode: KickStreamMode;
  autoStatus: KickAutoStatus;
}): "live" | "offline" {
  if (configuredMode === "live" || configuredMode === "offline") {
    return configuredMode;
  }

  return autoStatus === "live" ? "live" : "offline";
}

export type KickModeLabelKey =
  | "liveOnKick"
  | "reactionDemo"
  | "kickStatusStale"
  | "kickStatusUnknown"
  | "checkingKick";

export function getKickModeLabelKey({
  configuredMode,
  autoStatus,
  stale,
}: {
  configuredMode: KickStreamMode;
  autoStatus: KickAutoStatus;
  stale: boolean;
}): KickModeLabelKey {
  if (configuredMode === "live") {
    return "liveOnKick";
  }

  if (configuredMode === "offline") {
    return "reactionDemo";
  }

  if (autoStatus === "live") {
    return "liveOnKick";
  }

  if (autoStatus === "offline") {
    return stale ? "kickStatusStale" : "reactionDemo";
  }

  if (autoStatus === "unknown") {
    return "kickStatusUnknown";
  }

  return "checkingKick";
}
