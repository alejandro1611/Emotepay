import { NextResponse } from "next/server";
import {
  getKickStatus,
  KICK_STATUS_SHARED_CACHE_SECONDS,
  KICK_STATUS_STALE_WHILE_REVALIDATE_SECONDS,
} from "@/lib/kick-status";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  const status = await getKickStatus();

  return NextResponse.json(status, {
    headers: {
      "cache-control": `public, s-maxage=${KICK_STATUS_SHARED_CACHE_SECONDS}, stale-while-revalidate=${KICK_STATUS_STALE_WHILE_REVALIDATE_SECONDS}`,
    },
  });
}
