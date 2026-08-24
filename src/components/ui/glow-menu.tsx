"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type GlowMenuItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: "amber" | "blue" | "mint" | "orange" | "rose" | "silver";
};

type GlowMenuProps = {
  activeHref: string;
  className?: string;
  items: GlowMenuItem[];
};

export function GlowMenu({ activeHref, className, items }: GlowMenuProps) {
  return (
    <nav className={cn("glow-menu", className)} aria-label="主导航">
      <span className="glow-menu-aura" aria-hidden="true" />
      <ul className="relative z-10 flex items-center gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeHref === item.href;
          return (
            <li key={item.href}>
              <Link
                className={`glow-menu-item glow-menu-item-${item.tone}${active ? " is-active" : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                <span className="glow-menu-item-aura" aria-hidden="true" />
                <span className="glow-menu-face glow-menu-face-front">
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
                <span className="glow-menu-face glow-menu-face-back" aria-hidden="true">
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
