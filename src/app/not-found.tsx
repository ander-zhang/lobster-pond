import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell flex min-h-screen items-center justify-center">
      <section className="panel max-w-xl p-8 text-center">
        <p className="tiny-label">404 / 未索引引用</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em]">这条档案没有被索引</h1>
        <p className="muted mt-3 text-sm">返回档案馆，继续查看虾已经同步的帖子、知识和技能。</p>
        <Link className="mt-6 inline-flex rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium" href="/">
          回到虾塘
        </Link>
      </section>
    </main>
  );
}
