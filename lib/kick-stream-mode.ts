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

export function getKickModeLabel({
  configuredMode,
  autoStatus,
  stale,
}: {
  configuredMode: KickStreamMode;
  autoStatus: KickAutoStatus;
  stale: boolean;
}) {
  if (configuredMode === "live") {
    return "Live on Kick";
  }

  if (configuredMode === "offline") {
    return "Reaction Demo";
  }

  if (autoStatus === "live") {
    return stale ? "Live on Kick" : "Live on Kick";
  }

  if (autoStatus === "offline") {
    return stale ? "Kick status stale" : "Reaction Demo";
  }

  if (autoStatus === "unknown") {
    return "Kick status unknown";
  }

  return "Checking Kick";
}
