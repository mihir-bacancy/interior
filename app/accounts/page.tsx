import { eq } from "drizzle-orm";

import { AccountsClient } from "./client";
import { Nav } from "@/components/nav";
import { db, accounts, config } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [rows, defaultCfg] = await Promise.all([
    db.select().from(accounts).orderBy(accounts.username),
    db.query.config.findFirst({ where: eq(config.key, "default_outstand_account_id") }),
  ]);

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-5xl p-6">
        <AccountsClient initialAccounts={rows} initialDefault={defaultCfg?.value ?? null} />
      </div>
    </>
  );
}
