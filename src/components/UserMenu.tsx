"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
}

export function UserMenu({ name, email, role }: { name: string; email: string; role: "student" | "admin" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <details className="usermenu" ref={ref}>
      <summary aria-label="User menu">
        <span className="userinitials" aria-hidden="true">{initials}</span>
        <span className="caret" aria-hidden="true" />
      </summary>
      <div className="dropdown-menu" role="menu">
        <div className="dropdown-header"><b>{name}</b><br />{email}</div>
        <div className="dropdown-divider" />
        <Link className="dropdown-item" href="/attempts" role="menuitem">My attempts</Link>
        {role === "admin" && <Link className="dropdown-item" href="/admin" role="menuitem">Administration</Link>}
        <div className="dropdown-divider" />
        <button className="dropdown-item" type="button" role="menuitem" onClick={logout}>Log out</button>
      </div>
    </details>
  );
}

export function LogoutLink() {
  return <button type="button" className="btn btn-link p-0" style={{ verticalAlign: "baseline", fontSize: "inherit" }} onClick={logout}>Log out</button>;
}
