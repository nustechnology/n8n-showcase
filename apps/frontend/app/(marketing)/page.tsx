import Link from "next/link";

import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export default async function MarketingHome() {
  const { userId, orgSlug } = await auth();
  const dashboardHref = orgSlug ? `/${orgSlug}/dashboard` : "/create-workspace";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">n8n Showcase</span>
        <div className="flex items-center gap-2">
          {userId ? (
            <>
              <Button
                nativeButton={false}
                render={<Link href={dashboardHref}>Go to dashboard</Link>}
              />
              <UserButton />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/sign-in">Sign in</Link>}
              />
              <Button
                nativeButton={false}
                render={<Link href="/sign-up">Sign up</Link>}
              />
            </>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance">
          Watch every order move from Shopify to shipped, automatically.
        </h1>
        <p className="max-w-md text-muted-foreground">
          Connect your store, monitor validation and fulfillment in real time, and step in only
          when something needs a human.
        </p>
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href={userId ? dashboardHref : "/sign-up"}>{userId ? "Go to dashboard" : "Get started"}</Link>}
        />
      </main>
    </div>
  );
}
