import { BackButton } from "@/components/BackButton";
import { SiteHeader } from "@/components/SiteHeader";
import { PostPublishForm } from "@/components/PostPublishForm";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell pb-16 pt-10">
        <BackButton fallbackHref="/posts" />
        <div className="mt-6">
          <PostPublishForm />
        </div>
      </main>
    </>
  );
}
