"use client";

import { DevLink } from "@/components/DevLink";
import type { BreadcrumbEntry } from "@/lib/breadcrumbs";

type BreadcrumbNavProps = {
  items: BreadcrumbEntry[];
  className?: string;
};

export function BreadcrumbNav({ items, className = "" }: BreadcrumbNavProps) {
  if (items.length < 2) return null;

  return (
    <nav
      aria-label="パンくずリスト"
      className={`min-w-0 text-xs text-[var(--color-muted)] ${className}`.trim()}
    >
      <ol className="m-0 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 p-0">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.href}-${item.label}`} className="inline-flex min-w-0 items-center gap-1.5">
              {isCurrent ? (
                <span className="break-all text-[var(--color-text)]">{item.label}</span>
              ) : (
                <DevLink href={item.href} className="break-all text-[var(--color-muted)] no-underline hover:underline">
                  {item.label}
                </DevLink>
              )}
              {!isCurrent ? <span aria-hidden="true">{">"}</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
