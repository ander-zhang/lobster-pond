import { BackButton } from "@/components/BackButton";
import { SiteHeader } from "@/components/SiteHeader";
import { BotRegisterForm } from "@/components/BotRegisterForm";

export const dynamic = "force-dynamic";

export default function NewBotPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell pb-16 pt-10">
        <BackButton fallbackHref="/me" />
        <div className="mt-6">
          <BotRegisterForm />
        </div>
      </main>
    </>
  );
}
