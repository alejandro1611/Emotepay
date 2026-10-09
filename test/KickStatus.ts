import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  getKickStatus,
  resetKickStatusCachesForTests,
} from "../lib/kick-status";
import {
  getKickModeLabel,
  getResolvedKickStreamMode,
  normalizeKickStreamMode,
} from "../lib/kick-stream-mode";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Kick livestream status", function () {
  const environment = {
    NEXT_PUBLIC_KICK_CHANNEL: "demo-channel",
    KICK_API_ACCESS_TOKEN: "test-token",
  };

  it("reports live when the official channel stream is live", async function () {
    resetKickStatusCachesForTests();
    const fetchImplementation = mock.fn<typeof fetch>(async () =>
      jsonResponse({
        data: [
          {
            slug: "demo-channel",
            stream_title: "Demo stream",
            stream: {
              is_live: true,
              viewer_count: 42,
              start_time: "2026-10-09T20:00:00Z",
            },
          },
        ],
      }),
    );

    const status = await getKickStatus({
      environment,
      fetch: fetchImplementation,
      now: () => 1_000,
    });

    assert.equal(status.status, "live");
    assert.equal(status.channel, "demo-channel");
    assert.equal(status.title, "Demo stream");
    assert.equal(status.viewerCount, 42);
    assert.equal(fetchImplementation.mock.callCount(), 1);
  });

  it("reports offline without treating it as an API failure", async function () {
    resetKickStatusCachesForTests();
    const status = await getKickStatus({
      environment,
      fetch: async () =>
        jsonResponse({
          data: [
            {
              slug: "demo-channel",
              stream: {
                is_live: false,
              },
            },
          ],
        }),
      now: () => 1_000,
    });

    assert.equal(status.status, "offline");
    assert.equal(status.error, undefined);
  });

  it("returns unknown when credentials are missing", async function () {
    resetKickStatusCachesForTests();
    const status = await getKickStatus({
      environment: { NEXT_PUBLIC_KICK_CHANNEL: "demo-channel" },
      fetch: async () => {
        throw new Error("fetch should not be called");
      },
      now: () => 1_000,
    });

    assert.equal(status.status, "unknown");
    assert.equal(status.error, "Kick API credentials are not configured.");
  });

  it("uses client credentials without exposing the token in the status", async function () {
    resetKickStatusCachesForTests();
    const fetchImplementation = mock.fn<typeof fetch>(async (input) => {
      const url = input.toString();

      if (url === "https://id.kick.com/oauth/token") {
        return jsonResponse({
          access_token: "server-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }

      return jsonResponse({
        data: [
          {
            slug: "demo-channel",
            stream: { is_live: true },
          },
        ],
      });
    });

    const status = await getKickStatus({
      environment: {
        NEXT_PUBLIC_KICK_CHANNEL: "demo-channel",
        KICK_CLIENT_ID: "client-id",
        KICK_CLIENT_SECRET: "client-secret",
      },
      fetch: fetchImplementation,
      now: () => 1_000,
    });

    assert.equal(status.status, "live");
    assert.equal(JSON.stringify(status).includes("server-token"), false);
    assert.equal(fetchImplementation.mock.callCount(), 2);
  });

  it("returns stale cached status during a later API outage", async function () {
    resetKickStatusCachesForTests();
    let shouldFail = false;

    const fetchImplementation = mock.fn<typeof fetch>(async () => {
      if (shouldFail) {
        throw new Error("temporary outage");
      }

      return jsonResponse({
        data: [
          {
            slug: "demo-channel",
            stream: { is_live: true },
          },
        ],
      });
    });

    await getKickStatus({
      environment,
      fetch: fetchImplementation,
      now: () => 1_000,
    });

    shouldFail = true;
    const status = await getKickStatus({
      environment,
      fetch: fetchImplementation,
      now: () => 40_000,
    });

    assert.equal(status.status, "live");
    assert.equal(status.cached, true);
    assert.equal(status.stale, true);
    assert.equal(status.error, "Kick status is temporarily unavailable.");
  });

  it("normalizes forced modes and resolves auto transitions", function () {
    assert.equal(normalizeKickStreamMode("auto"), "auto");
    assert.equal(normalizeKickStreamMode("live"), "live");
    assert.equal(normalizeKickStreamMode("offline"), "offline");
    assert.equal(normalizeKickStreamMode("unexpected"), "offline");
    assert.equal(
      getResolvedKickStreamMode({
        configuredMode: "auto",
        autoStatus: "loading",
      }),
      "offline",
    );
    assert.equal(
      getResolvedKickStreamMode({
        configuredMode: "auto",
        autoStatus: "live",
      }),
      "live",
    );
    assert.equal(
      getResolvedKickStreamMode({
        configuredMode: "auto",
        autoStatus: "offline",
      }),
      "offline",
    );
    assert.equal(
      getKickModeLabel({
        configuredMode: "auto",
        autoStatus: "unknown",
        stale: false,
      }),
      "Kick status unknown",
    );
  });
});
