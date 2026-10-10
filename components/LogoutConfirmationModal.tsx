"use client";

import { useEffect } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useI18n } from "@/components/LanguageProvider";

type LogoutConfirmationModalProps = {
  isLoggingOut: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutConfirmationModal({
  isLoggingOut,
  error,
  onCancel,
  onConfirm,
}: LogoutConfirmationModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoggingOut) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLoggingOut, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 text-white backdrop-blur-sm"
      onMouseDown={() => {
        if (!isLoggingOut) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-description"
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 text-rose-200">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="logout-title" className="text-lg font-black">
              {t.auth.logoutTitle}
            </h2>
            <p
              id="logout-description"
              className="mt-1 text-sm leading-5 text-slate-300"
            >
              {t.auth.logoutQuestion}
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoggingOut}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-purple-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-bold text-white transition hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut && (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {isLoggingOut ? t.auth.loggingOut : t.auth.logOut}
          </button>
        </div>
      </section>
    </div>
  );
}
