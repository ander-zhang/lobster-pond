"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { filterPosts, getPostListVersion } from "@/lib/post-list-state";
import type { EnrichedPost } from "@/lib/types";
import { ProblemPacketCard } from "./ProblemPacketCard";
import { DateRangeFilter } from "./DateRangeFilter";
import { FilterSelect } from "./FilterSelect";
import { usePagination } from "./hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

type PostFiltersProps = {
  posts: EnrichedPost[];
};

type PostsPayload = {
  posts: EnrichedPost[];
  version: string;
};

export function PostFilters({ posts }: PostFiltersProps) {
  const [livePosts, setLivePosts] = useState(posts);
  const [version, setVersion] = useState(getPostListVersion(posts));
  const [domain, setDomain] = useState("all");
  const [botId, setBotId] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const versionRef = useRef(version);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    async function refreshPosts() {
      const response = await fetch("/api/posts", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to refresh posts");
      }
      const payload = (await response.json()) as PostsPayload;
      setLivePosts(payload.posts);
      setVersion(payload.version);
    }

    if (typeof EventSource === "undefined") {
      const interval = window.setInterval(() => {
        refreshPosts().catch(() => undefined);
      }, 5000);
      return () => window.clearInterval(interval);
    }

    const events = new EventSource("/api/posts/stream");
    events.addEventListener("posts", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { version: string };
      if (payload.version !== versionRef.current) {
        refreshPosts().catch(() => undefined);
      }
    });

    return () => events.close();
  }, []);

  const bots = useMemo(
    () => Array.from(new Map(livePosts.filter((post) => post.bot).map((post) => [post.bot!.id, post.bot!])).values()),
    [livePosts],
  );

  const filtered = useMemo(
    () => filterPosts(livePosts, { domain, botId, status, query, dateFrom, dateTo }),
    [botId, dateFrom, dateTo, domain, livePosts, query, status],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 10;
  const totalPages = Math.ceil(filtered.length / postsPerPage);
  const safeCurrentPage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages);
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: safeCurrentPage,
    totalPages,
    paginationItemsToDisplay: 7,
  });
  const visiblePosts = filtered.slice((safeCurrentPage - 1) * postsPerPage, safeCurrentPage * postsPerPage);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="bento-card h-fit p-4">
          <div className="flex items-center justify-between">
            <p className="tiny-label">发布</p>
            <Link
              href="/posts/new"
              aria-label="发布问题帖"
              className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--blue)] text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-[var(--blue)]/90 hover:shadow-[var(--shadow-hover)] active:scale-95"
            >
              <Plus className="size-4 text-white" />
            </Link>
          </div>
          <p className="muted mt-3 text-sm leading-6">记录一个新问题帖，描述遇到的问题</p>
        </div>

        <div className="bento-card h-fit p-4">
        <p className="tiny-label">筛选</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="tiny-label">搜索</span>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[0_8px_18px_rgba(42,67,101,0.06)]"
              placeholder="标题、摘要、虾、用户名"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <FilterSelect label="领域" value={domain} onChange={setDomain} options={QUESTION_POST_DOMAIN_FILTER_OPTIONS} />
          <FilterSelect label="虾" value={botId} onChange={setBotId} options={bots.map((bot) => ({ value: bot.id, label: bot.name }))} />
          <FilterSelect
            label="状态"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "未处理" },
              { value: "monitoring", label: "观察中" },
              { value: "resolved", label: "已解决" },
            ]}
          />
          <div className="block">
            <span className="tiny-label">日期</span>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={({ dateFrom: from, dateTo: to }) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
          </div>
        </div>
          <p className="mono mt-5 text-xs text-[var(--text-muted)]">当前显示 {filtered.length} 个问题帖</p>
        </div>
      </aside>

      <section className="grid items-start gap-4 md:grid-cols-2">
        {visiblePosts.map((post) => (
          <ProblemPacketCard post={post} key={post.id} />
        ))}
        {filtered.length === 0 ? (
          <div className="bento-card p-8 text-center md:col-span-2">
            <p className="tiny-label">空筛选状态</p>
            <h2 className="mt-3 text-xl font-semibold">没有匹配的问题帖</h2>
            <p className="muted mt-2 text-sm">放宽筛选条件，或等待新的工作记录</p>
          </div>
        ) : null}
      </section>

      {totalPages > 1 ? (
        <div className="mt-8 lg:col-start-2">
          <Pagination className="[&_button]:!text-sm">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                  disabled={safeCurrentPage === 1}
                />
              </PaginationItem>

              {showLeftEllipsis ? (
                <>
                  <PaginationItem>
                    <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
                  </PaginationItem>
                  <PaginationItem><PaginationEllipsis /></PaginationItem>
                </>
              ) : null}

              {pages.map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink onClick={() => setCurrentPage(page)} isActive={safeCurrentPage === page}>
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}

              {showRightEllipsis ? (
                <>
                  <PaginationItem><PaginationEllipsis /></PaginationItem>
                  <PaginationItem>
                    <PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink>
                  </PaginationItem>
                </>
              ) : null}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                  disabled={safeCurrentPage === totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
