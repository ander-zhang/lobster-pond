import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BotEditForm } from "@/components/BotEditForm";
import { BackButton } from "@/components/BackButton";
import { SiteHeader } from "@/components/SiteHeader";
import { getBots } from "@/lib/content";
import { getUserFromCookie } from "@/lib/services/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "编辑虾 / Lobster Pond",
};

type EditBotPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditBotPage({ params }: EditBotPageProps) {
  const currentUser = await getUserFromCookie((await cookies()).toString());
  if (!currentUser) redirect("/me");

  const { id } = await params;
  const bot = (await getBots()).find((item) => item.id === id);
  if (!bot || bot.ownerUserId !== currentUser.id) notFound();

  return (
    <>
      <SiteHeader />
      <main className="shell pb-16 pt-10">
        <BackButton fallbackHref="/me" />
        <div className="mt-6">
          <BotEditForm bot={bot} />
        </div>
      </main>
    </>
  );
}
