import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ONBOARDING_TOUR_STORAGE_KEY,
  getAvailableOnboardingStepIndexes,
  getNextAvailableStepIndex,
  getResponsiveTooltipPosition,
  readOnboardingTourStatus,
  shouldAutoStartOnboardingTour,
  shouldStartManualOnboardingTour,
  writeOnboardingTourStatus,
  type OnboardingTourStorage,
} from "../lib/onboarding-tour";

function createMemoryStorage(): OnboardingTourStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();

  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("onboarding tour", function () {
  it("auto-starts for a first-time viewer after the app is ready", function () {
    assert.equal(
      shouldAutoStartOnboardingTour({
        authReady: true,
        authenticated: true,
        walletsReady: true,
        hasEmbeddedWallet: true,
        balanceReady: true,
        isActivePayment: false,
        hasBlockingModal: false,
        storedStatus: null,
      }),
      true,
    );
  });

  it("does not auto-start after the tour was completed", function () {
    const storage = createMemoryStorage();

    writeOnboardingTourStatus(storage, "completed");

    assert.equal(
      readOnboardingTourStatus(storage),
      "completed",
    );
    assert.equal(
      shouldAutoStartOnboardingTour({
        authReady: true,
        authenticated: true,
        walletsReady: true,
        hasEmbeddedWallet: true,
        balanceReady: true,
        isActivePayment: false,
        hasBlockingModal: false,
        storedStatus: readOnboardingTourStatus(storage),
      }),
      false,
    );
  });

  it("does not auto-start after the tour was skipped", function () {
    const storage = createMemoryStorage();

    writeOnboardingTourStatus(storage, "skipped");

    assert.equal(storage.values.get(ONBOARDING_TOUR_STORAGE_KEY), "skipped");
    assert.equal(
      shouldAutoStartOnboardingTour({
        authReady: true,
        authenticated: true,
        walletsReady: true,
        hasEmbeddedWallet: true,
        balanceReady: true,
        isActivePayment: false,
        hasBlockingModal: false,
        storedStatus: readOnboardingTourStatus(storage),
      }),
      false,
    );
  });

  it("allows manual restart only when no payment or modal is active", function () {
    assert.equal(
      shouldStartManualOnboardingTour({
        isActivePayment: false,
        hasBlockingModal: false,
      }),
      true,
    );
    assert.equal(
      shouldStartManualOnboardingTour({
        isActivePayment: true,
        hasBlockingModal: false,
      }),
      false,
    );
    assert.equal(
      shouldStartManualOnboardingTour({
        isActivePayment: false,
        hasBlockingModal: true,
      }),
      false,
    );
  });

  it("handles missing highlighted elements by skipping unavailable steps", function () {
    const selectors = [
      '[data-tour="stream-preview"]',
      '[data-tour="missing"]',
      '[data-tour="fund-wallet"]',
    ];
    const available = getAvailableOnboardingStepIndexes(selectors, (selector) =>
      selector === '[data-tour="missing"]' ? null : {},
    );

    assert.deepEqual(available, [0, 2]);
    assert.equal(
      getNextAvailableStepIndex({
        currentIndex: 0,
        direction: 1,
        availableIndexes: available,
      }),
      2,
    );
  });

  it("keeps the tooltip inside a 320px mobile viewport", function () {
    const position = getResponsiveTooltipPosition({
      targetRect: {
        top: 420,
        left: 250,
        width: 56,
        height: 44,
      },
      tooltipSize: {
        width: 336,
        height: 244,
      },
      viewport: {
        width: 320,
        height: 640,
      },
    });

    assert.equal(position.left >= 16, true);
    assert.equal(position.left + 288 <= 320 - 16, true);
    assert.equal(position.top >= 16, true);
    assert.equal(position.top + 244 <= 640 - 16, true);
  });

  it("ignores localStorage read and write failures", function () {
    const brokenStorage: OnboardingTourStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    assert.equal(readOnboardingTourStatus(brokenStorage), null);
    assert.doesNotThrow(() =>
      writeOnboardingTourStatus(brokenStorage, "completed"),
    );
  });
});
