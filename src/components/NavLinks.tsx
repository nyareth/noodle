"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; exact?: boolean }

export function NavLinks({ items, listClass, linkClass }: { items: NavItem[]; listClass: string; linkClass?: string }) {
  const path = usePathname();
  return (
    <ul className={listClass}>
      {items.map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return (
          <li key={i.href}>
            <Link href={i.href} className={`${linkClass ?? "nav-link"}${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
