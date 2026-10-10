export const ONBOARDING_TOUR_VERSION = 1;
export const ONBOARDING_TOUR_STORAGE_KEY = `emotepay:onboarding:v${ONBOARDING_TOUR_VERSION}`;

export type OnboardingTourStoredStatus = "completed" | "skipped";

export type OnboardingTourStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

export type OnboardingTourReadinessInput = {
  authReady: boolean;
  authenticated: boolean;
  walletsReady: boolean;
  hasEmbeddedWallet: boolean;
  balanceReady: boolean;
  isActivePayment: boolean;
  hasBlockingModal: boolean;
  storedStatus: OnboardingTourStoredStatus | null;
};

export type TourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type TourViewport = {
  width: number;
  height: number;
};

export type TourTooltipPosition = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

export function readOnboardingTourStatus(
  storage: OnboardingTourStorage | null | undefined,
): OnboardingTourStoredStatus | null {
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(ONBOARDING_TOUR_STORAGE_KEY);

    return value === "completed" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

export function getBrowserOnboardingTourStorage():
  | OnboardingTourStorage
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function writeOnboardingTourStatus(
  storage: OnboardingTourStorage | null | undefined,
  status: OnboardingTourStoredStatus,
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(ONBOARDING_TOUR_STORAGE_KEY, status);
  } catch {
    // The tour should remain usable when localStorage is blocked or full.
  }
}

export function shouldAutoStartOnboardingTour({
  authReady,
  authenticated,
  walletsReady,
  hasEmbeddedWallet,
  balanceReady,
  isActivePayment,
  hasBlockingModal,
  storedStatus,
}: OnboardingTourReadinessInput) {
  return (
    authReady &&
    authenticated &&
    walletsReady &&
    hasEmbeddedWallet &&
    balanceReady &&
    !isActivePayment &&
    !hasBlockingModal &&
    storedStatus === null
  );
}

export function shouldStartManualOnboardingTour({
  isActivePayment,
  hasBlockingModal,
}: {
  isActivePayment: boolean;
  hasBlockingModal: boolean;
}) {
  return !isActivePayment && !hasBlockingModal;
}

export function getAvailableOnboardingStepIndexes(
  selectors: string[],
  queryElement: (selector: string) => unknown,
) {
  return selectors.reduce<number[]>((available, selector, index) => {
    if (queryElement(selector)) {
      available.push(index);
    }

    return available;
  }, []);
}

export function getNextAvailableStepIndex({
  currentIndex,
  direction,
  availableIndexes,
}: {
  currentIndex: number;
  direction: 1 | -1;
  availableIndexes: number[];
}) {
  if (availableIndexes.length === 0) {
    return currentIndex;
  }

  const currentAvailableIndex = availableIndexes.indexOf(currentIndex);

  if (currentAvailableIndex === -1) {
    return direction > 0 ? availableIndexes[0] : availableIndexes.at(-1)!;
  }

  const nextIndex = currentAvailableIndex + direction;

  if (nextIndex < 0 || nextIndex >= availableIndexes.length) {
    return currentIndex;
  }

  return availableIndexes[nextIndex];
}

export function getResponsiveTooltipPosition({
  targetRect,
  tooltipSize,
  viewport,
  margin = 16,
  gap = 12,
}: {
  targetRect: TourRect;
  tooltipSize: { width: number; height: number };
  viewport: TourViewport;
  margin?: number;
  gap?: number;
}): TourTooltipPosition {
  const availableWidth = Math.max(viewport.width - margin * 2, 0);
  const width = Math.min(tooltipSize.width, availableWidth);
  const targetCenter = targetRect.left + targetRect.width / 2;
  const left = Math.min(
    Math.max(targetCenter - width / 2, margin),
    Math.max(viewport.width - width - margin, margin),
  );
  const bottomTop = targetRect.top + targetRect.height + gap;
  const topTop = targetRect.top - tooltipSize.height - gap;
  const fitsBelow = bottomTop + tooltipSize.height + margin <= viewport.height;
  const fitsAbove = topTop >= margin;
  const placement = fitsBelow || !fitsAbove ? "bottom" : "top";
  const preferredTop = placement === "bottom" ? bottomTop : topTop;
  const top = Math.min(
    Math.max(preferredTop, margin),
    Math.max(viewport.height - tooltipSize.height - margin, margin),
  );

  return {
    top,
    left,
    placement,
  };
}
