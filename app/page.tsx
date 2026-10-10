import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {SiteHeader} from "@/components/marketing/site-header";
import {Hero} from "@/components/marketing/hero";
import {Tools} from "@/components/marketing/tools";
import {HowItWorks} from "@/components/marketing/how-it-works";
import {Notices} from "@/components/marketing/notices";
import {Performance} from "@/components/marketing/performance";
import {Pricing} from "@/components/marketing/pricing";
import {FinalCall, SiteFooter, Trust} from "@/components/marketing/closing";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  return (
    <main className="bg-ink">
      <SiteHeader />
      <Hero />
      <Tools />
      <HowItWorks />
      <Notices />
      <Performance />
      <Pricing />
      <Trust />
      <FinalCall />
      <SiteFooter />
    </main>
  );
}
