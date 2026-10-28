import Link from "next/link";
import { env } from "@/lib/env";
import type { SessionUser } from "@/lib/services/users";
import { NavLinks, type NavItem } from "./NavLinks";
import { LogoutLink, UserMenu } from "./UserMenu";

export interface Crumb { label: string; href?: string }

export const ADMIN_TABS: NavItem[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/subjects", label: "Subjects" },
  { href: "/admin/import", label: "Import questions" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/attempts", label: "Attempts" },
  { href: "/admin/users", label: "Users" },
];

/**
 * The Moodle page frame: fixed top navbar, breadcrumb, page title, white content region and footer.
 *  - `raw`: the page renders its own #region-main (and drawer), like the quiz attempt page.
 *  - `drawer`: reserve room for the right-hand block drawer (quiz navigation).
 */
export function MoodleShell({
  user, title, crumbs = [], children, raw = false, drawer = false, adminTabs = false, actions, bare = false,
}: {
  user: SessionUser | null;
  title: string;
  crumbs?: Crumb[];
  children: React.ReactNode;
  raw?: boolean;
  drawer?: boolean;
  adminTabs?: boolean;
  actions?: React.ReactNode;
  /** login / register: no breadcrumb or title, just the frame */
  bare?: boolean;
}) {
  const primary: NavItem[] = user
    ? [{ href: "/", label: "Home", exact: true }, { href: "/attempts", label: "My attempts" }, ...(user.role === "admin" ? [{ href: "/admin", label: "Administration" }] : [])]
    : [];
  const name = env.siteName;
  return (
    <>
      <nav className="navbar" aria-label="Site navigation">
        <Link className="navbar-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brandlogo" src="/noodle-logo.svg" alt="" width={36} height={36} />
          <span className="brandtext">{name}</span>
        </Link>
        {user && <NavLinks items={primary} listClass="primary-nav" linkClass="nav-link" />}
        <div className="navbar-right">
          {user ? <UserMenu name={user.name} email={user.email} role={user.role} /> : <Link href="/login" className="nav-link" style={{ padding: "0 1rem" }}>Log in</Link>}
        </div>
      </nav>
      <div id="page" className={drawer ? "page-with-drawer" : undefined}>
        {!bare && <div id="page-header">
          <nav aria-label="Navigation bar">
            <ol className="breadcrumb">
              <li className="breadcrumb-item"><Link href="/">Home</Link></li>
              {crumbs.map((c, i) => (
                <li key={i} className={`breadcrumb-item${c.href ? "" : " active"}`} aria-current={c.href ? undefined : "page"}>
                  {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                </li>
              ))}
            </ol>
          </nav>
          <div className="page-header-headings d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h1 className="h2">{title}</h1>
            {actions}
          </div>
          {adminTabs && <NavLinks items={ADMIN_TABS} listClass="secondary-nav" linkClass="" />}
        </div>}
        <div id="page-content">
          {raw || bare ? children : (
            <section id="region-main" aria-label="Content">
              <div role="main">{children}</div>
            </section>
          )}
        </div>
        {user && (
          <footer id="page-footer">
            You are logged in as <Link href="/attempts">{user.name}</Link> (<LogoutLink />)
          </footer>
        )}
      </div>
    </>
  );
}
