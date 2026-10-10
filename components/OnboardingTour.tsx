"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  getBrowserOnboardingTourStorage,
  getAvailableOnboardingStepIndexes,
  getNextAvailableStepIndex,
  getResponsiveTooltipPosition,
  writeOnboardingTourStatus,
  type OnboardingTourStoredStatus,
  type TourTooltipPosition,
} from "@/lib/onboarding-tour";
import { useI18n } from "@/components/LanguageProvider";

export type OnboardingTourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
};

type OnboardingTourProps = {
  open: boolean;
  steps: OnboardingTourStep[];
  onClose: (status: OnboardingTourStoredStatus) => void;
};

type HighlightBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 336;
const TOOLTIP_HEIGHT = 244;

function getElementHighlight(element: Element): HighlightBox {
  const rect = element.getBoundingClientRect();

  return {
    top: Math.max(rect.top - SPOTLIGHT_PADDING, 8),
    left: Math.max(rect.left - SPOTLIGHT_PADDING, 8),
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

export function OnboardingTour({
  open,
  steps,
  onClose,
}: OnboardingTourProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [highlight, setHighlight] = useState<HighlightBox | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TourTooltipPosition | null>(null);
  const selectors = useMemo(() => steps.map((step) => step.selector), [steps]);
  const [availableIndexes, setAvailableIndexes] = useState<number[]>([]);
  const effectiveCurrentIndex = availableIndexes.includes(currentIndex)
    ? currentIndex
    : availableIndexes[0] ?? currentIndex;
  const currentStep = steps[effectiveCurrentIndex];
  const currentAvailablePosition =
    availableIndexes.indexOf(effectiveCurrentIndex);
  const progressPosition =
    currentAvailablePosition === -1 ? 1 : currentAvailablePosition + 1;
  const progressTotal = Math.max(availableIndexes.length, 1);
  const isFirstStep = currentAvailablePosition <= 0;
  const isLastStep =
    currentAvailablePosition === -1 ||
    currentAvailablePosition === availableIndexes.length - 1;

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const animationFrameId = window.requestAnimationFrame(() => {
      setAvailableIndexes(
        getAvailableOnboardingStepIndexes(selectors, (selector) =>
          document.querySelector(selector),
        ),
      );
    });
    dialogRef.current?.focus();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      previousFocusRef.current?.focus?.();
    };
  }, [open, selectors]);

  useEffect(() => {
    if (!open || !currentStep) {
      return;
    }

    let animationFrameId = 0;

    const updatePosition = () => {
      const element = document.querySelector(currentStep.selector);

      if (!element) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        const nextHighlight = getElementHighlight(element);
        setHighlight(nextHighlight);
        setTooltipPosition(
          getResponsiveTooltipPosition({
            targetRect: nextHighlight,
            tooltipSize: {
              width: TOOLTIP_WIDTH,
              height: TOOLTIP_HEIGHT,
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          }),
        );
      });
    };

    const element = document.querySelector(currentStep.selector);
    element?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [currentStep, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        writeOnboardingTourStatus(
          getBrowserOnboardingTourStorage(),
          "skipped",
        );
        onClose("skipped");
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ),
        );

        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !currentStep || availableIndexes.length === 0) {
    return null;
  }

  const close = (status: OnboardingTourStoredStatus) => {
    writeOnboardingTourStatus(getBrowserOnboardingTourStorage(), status);
    onClose(status);
  };

  const goToRelativeStep = (direction: 1 | -1) => {
    setCurrentIndex((index) =>
      getNextAvailableStepIndex({
        currentIndex: availableIndexes.includes(index)
          ? index
          : effectiveCurrentIndex,
        direction,
        availableIndexes,
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]" />

      {highlight && (
        <div
          aria-hidden="true"
          className="absolute rounded-2xl border border-purple-300/80 bg-purple-300/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.72),0_0_36px_rgba(168,85,247,0.45)] transition-[height,left,top,width] duration-200 motion-reduce:transition-none"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        tabIndex={-1}
        className="pointer-events-auto fixed max-h-[calc(100dvh-2rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl shadow-purple-950/50 outline-none sm:p-5"
        style={{
          top: tooltipPosition?.top ?? 16,
          left: tooltipPosition?.left ?? 16,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-purple-100">
            {t.tour.progress(progressPosition, progressTotal)}
          </p>
          <button
            type="button"
            onClick={() => close("skipped")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/70 text-slate-400 transition-colors hover:text-white"
            aria-label={t.tour.skipAria}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2
          id="onboarding-tour-title"
          className="mt-3 text-lg font-black leading-tight text-white"
        >
          {currentStep.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {currentStep.body}
        </p>

        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {availableIndexes.map((stepIndex) => (
            <span
              key={stepIndex}
              className={`h-1.5 flex-1 rounded-full ${
                stepIndex === effectiveCurrentIndex
                  ? "bg-purple-300"
                  : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goToRelativeStep(-1)}
            disabled={isFirstStep}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.tour.previous}
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={() => close("completed")}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-purple-600 px-4 text-sm font-bold text-white transition-colors hover:bg-purple-500"
            >
              {t.tour.finish}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToRelativeStep(1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-purple-600 px-4 text-sm font-bold text-white transition-colors hover:bg-purple-500"
            >
              {t.tour.next}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => close("skipped")}
          className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:text-white"
        >
          {t.tour.skip}
        </button>
      </div>
    </div>
  );
}
