"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
type NavigationEntry = { index: number; url: string | null };
type NavigationHistory = {
  currentEntry: NavigationEntry | null;
  entries(): NavigationEntry[];
};

function previousInAppEntry(): boolean {
  const navigation = (window as Window & { navigation?: NavigationHistory }).navigation;
  const currentEntry = navigation?.currentEntry;
  if (navigation && currentEntry) {
    const previousEntry = navigation.entries().find((entry) => entry.index === currentEntry.index - 1);
    if (!previousEntry?.url) return false;
    return new URL(previousEntry.url).origin === window.location.origin;
  }

  // Navigation API 不可用时仅在 referrer 明确属于本站时返回，避免把用户带回外站。
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin && window.history.length > 1;
  } catch {
    return false;
  }
}

function safeFallback(href: string): string {
  return href.startsWith("/") && !href.startsWith("//") ? href : "/";
}

export function BackButton({ fallbackHref = "/" }: { fallbackHref?: string }) {
  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (previousInAppEntry()) {
      event.preventDefault();
      window.history.back();
    }
  }

  return (
    <Link
      href={safeFallback(fallbackHref)}
      onClick={goBack}
      className="chip-link inline-flex items-center rounded-full border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
    >
      {"< 返回"}
    </Link>
  );
}
