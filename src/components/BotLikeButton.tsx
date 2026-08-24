"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

export function BotLikeButton({
  botId,
  initialCount,
  initialLikedToday,
  initialDailyLikeUsed,
}: {
  botId: string;
  initialCount: number;
  initialLikedToday: boolean;
  initialDailyLikeUsed: boolean;
}) {
  const { user, loading: authLoading, openAuth } = useAuth();
  const [count, setCount] = useState(initialCount);
  const [likedToday, setLikedToday] = useState(initialLikedToday);
  const [dailyLikeUsed, setDailyLikeUsed] = useState(initialDailyLikeUsed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const unavailable = likedToday || dailyLikeUsed;

  async function handleLike() {
    if (!user) {
      openAuth("login");
      return;
    }
    if (unavailable || pending) return;

    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/like`, { method: "POST" });
      const payload = await response.json() as {
        ok: boolean;
        error?: string;
        like?: { count: number; likedToday: boolean; dailyLikeUsed: boolean };
      };
      if (!response.ok || !payload.ok || !payload.like) {
        if (response.status === 401) openAuth("login");
        if (response.status === 409) setDailyLikeUsed(true);
        setError(payload.error ?? "点赞失败，请稍后重试。");
        return;
      }
      setCount(payload.like.count);
      setLikedToday(payload.like.likedToday);
      setDailyLikeUsed(payload.like.dailyLikeUsed);
    } catch {
      setError("点赞失败，请检查网络后重试。");
    } finally {
      setPending(false);
    }
  }

  const label = likedToday ? "今日已赞" : dailyLikeUsed ? "今日机会已用" : "点赞";

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        type="button"
        className="py-0 pe-0 !text-sm sm:!text-base"
        variant="outline"
        aria-pressed={likedToday}
        aria-label={`${label}，累计 ${count} 个赞`}
        disabled={authLoading || pending || (Boolean(user) && unavailable)}
        onClick={() => void handleLike()}
      >
        <ThumbsUp className="me-2 size-[1em] opacity-60" strokeWidth={2} aria-hidden="true" />
        {pending ? "点赞中" : label}
        <span className="relative ms-3 inline-flex h-full items-center justify-center rounded-full px-3 text-xs font-medium text-muted-foreground before:absolute before:inset-0 before:left-0 before:w-px before:bg-input">
          {count}
        </span>
      </Button>
      {error && <p role="alert" className="max-w-48 text-right text-xs leading-5 text-[var(--accent)]">{error}</p>}
    </div>
  );
}
