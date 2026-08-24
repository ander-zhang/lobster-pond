"use client";

import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { usePagination } from "@/components/hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { SKILL_SCENARIO_OPTIONS } from "@/lib/skill-scenarios";
import { categoriesForDomain, subtypesForDomainCategory } from "@/lib/knowledge-taxonomy";
import { filterLibraryDocs } from "@/lib/library-list-state";
import { docAuthorName } from "@/lib/doc-author-name";
import type { Bot, DocType, MarkdownDoc } from "@/lib/types";
import { DocUploadButton } from "./DocUploadButton";
import { LibraryDocCard } from "./LibraryDocCard";

export function LibraryFilters({ docs, bots, referenceCounts, assetFilenames, authorNames, canUpload }: {
  docs: MarkdownDoc[];
  bots: Bot[];
  referenceCounts: Map<string, number>;
  assetFilenames: Map<string, string>;
  authorNames: Map<string, string>;
  canUpload: boolean;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <DocColumn
        docs={docs.filter((doc) => doc.type === "knowledge")}
        bots={bots}
        referenceCounts={referenceCounts}
        assetFilenames={assetFilenames}
        authorNames={authorNames}
        title="知识"
        type="knowledge"
        canUpload={canUpload}
      />
      <DocColumn
        docs={docs.filter((doc) => doc.type === "skills")}
        bots={bots}
        referenceCounts={referenceCounts}
        assetFilenames={assetFilenames}
        authorNames={authorNames}
        title="技能"
        type="skills"
        canUpload={canUpload}
      />
    </div>
  );
}

function DocColumn({ title, type, docs, bots, referenceCounts, assetFilenames, authorNames, canUpload }: {
  title: string;
  type: DocType;
  docs: MarkdownDoc[];
  bots: Bot[];
  referenceCounts: Map<string, number>;
  assetFilenames: Map<string, string>;
  authorNames: Map<string, string>;
  canUpload: boolean;
}) {
  const [domain, setDomain] = useState("all");
  const [botId, setBotId] = useState("all");
  const [category, setCategory] = useState("all");
  const [subtype, setSubtype] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterLibraryDocs(docs, { domain, botId, query, category, subtype }),
    [docs, domain, botId, query, category, subtype],
  );
  const [currentPage, setCurrentPage] = useState(1);
  // 任一筛选条件变化都回到第一页，避免停留在收窄后不存在的页码。
  function applyFilter(apply: () => void) {
    apply();
    setCurrentPage(1);
  }
  const docsPerPage = 10;
  const totalPages = Math.ceil(filtered.length / docsPerPage);
  const safeCurrentPage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages);
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: safeCurrentPage,
    totalPages,
    paginationItemsToDisplay: 7,
  });
  const visibleDocs = filtered.slice((safeCurrentPage - 1) * docsPerPage, safeCurrentPage * docsPerPage);
  const botOptions = useMemo(() => {
    const ids = new Set(docs.flatMap((doc) => doc.ownerBotIds));
    return bots.filter((bot) => ids.has(bot.id)).map((bot) => ({ value: bot.id, label: bot.name }));
  }, [bots, docs]);
  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot] as const)), [bots]);
  const maxRefs = Math.max(1, ...filtered.map((doc) => referenceCounts.get(doc.id) ?? 0));
  const isKnowledge = type === "knowledge";
  const classificationOptions = isKnowledge
    ? QUESTION_POST_DOMAIN_FILTER_OPTIONS
    : SKILL_SCENARIO_OPTIONS.map((s) => ({ value: s, label: s }));
  // 种别/类型按所选领域级联（目录树：领域→种别→类型）；领域=全部时不筛种别（种别按领域、跨域无意义）。
  const showCategoryFilter = isKnowledge && domain !== "all";
  const categoryFilterOptions = showCategoryFilter
    ? categoriesForDomain(domain).map((c) => ({ value: c, label: c }))
    : [];
  const subtypeList = showCategoryFilter && category !== "all"
    ? subtypesForDomainCategory(domain, category)
    : [];
  const showSubtypeFilter = subtypeList.length > 0;
  const subtypeFilterOptions = subtypeList.map((s) => ({ value: s, label: s }));

  return (
    <section className="bento-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {canUpload ? <DocUploadButton type={type} /> : null}
      </div>
      <label className="mt-5 block">
        <span className="tiny-label">搜索</span>
        <input
          className="mt-2 w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[0_8px_18px_rgba(42,67,101,0.06)]"
          placeholder="标题、ID、摘要"
          value={query}
          onChange={(event) => applyFilter(() => setQuery(event.target.value))}
        />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FilterSelect label={isKnowledge ? "领域" : "场景"} value={domain} onChange={(value) => applyFilter(() => { setDomain(value); setCategory("all"); setSubtype("all"); })} options={classificationOptions} />
        {showCategoryFilter ? (
          <FilterSelect
            label="种别"
            value={category}
            onChange={(value) => applyFilter(() => { setCategory(value); setSubtype("all"); })}
            options={categoryFilterOptions}
          />
        ) : null}
        {showSubtypeFilter ? (
          <FilterSelect
            label="类型"
            value={subtype}
            onChange={(value) => applyFilter(() => setSubtype(value))}
            options={subtypeFilterOptions}
          />
        ) : null}
        <FilterSelect label="虾" value={botId} onChange={(value) => applyFilter(() => setBotId(value))} options={botOptions} />
      </div>
      <p className="mono mt-4 text-xs text-[var(--text-muted)]">当前显示 {filtered.length} 个{title}</p>
      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--hairline)] bg-white/60 p-4 text-sm text-[var(--text-muted)]">
            没有匹配的{title}
          </p>
        ) : visibleDocs.map((doc) => (
          <LibraryDocCard
            doc={doc}
            references={referenceCounts.get(doc.id) ?? 0}
            maxRefs={maxRefs}
            filename={assetFilenames.get(doc.id)}
            authorName={docAuthorName(doc, botsById, authorNames)}
            key={`${doc.type}-${doc.id}`}
          />
        ))}
      </div>
      {totalPages > 1 ? (
        <div className="mt-6">
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
                  <PaginationItem><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>
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
                  <PaginationItem><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>
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
    </section>
  );
}
