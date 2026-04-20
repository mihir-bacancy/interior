"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/videos", label: "Videos" },
  { href: "/schedule", label: "Schedule" },
  { href: "/accounts", label: "Accounts" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background px-6">
      <div className="font-semibold tracking-tight">interior</div>
      <div className="ml-8 flex gap-1">
        {links.map((l) => {
          const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
      >
        Log out
      </button>
    </nav>
  );
}
