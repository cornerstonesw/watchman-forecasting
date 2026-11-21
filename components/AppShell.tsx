"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChevronsLeft, ChevronsRight, FileSpreadsheet, KeyRound, LayoutDashboard, LogOut, MessageSquareText, Moon, Sun, Telescope, Users } from "lucide-react";
import { LogoLockup, LogoMark } from "@/components/Logo";
import { useWorkspace } from "@/components/Workspace";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/explore", label: "Part explorer", icon: Telescope },
  { href: "/imports", label: "Imports", icon: FileSpreadsheet },
  { href: "/questions", label: "Questions", icon: MessageSquareText },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen },
  { href: "/team", label: "Team & security", icon: Users, admin: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const { who, isAdmin } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("wf_nav") === "min"); } catch { /* ignore */ }
    const t = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(t ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const toggleNav = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("wf_nav", c ? "full" : "min"); } catch { /* ignore */ }
      return !c;
    });
  };
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("wf_theme", next); } catch { /* ignore */ }
    setTheme(next);
  };
  // keep the comparison (?base&curr) when moving between pages
  const keep = ["base", "curr"].filter((k) => params.get(k)).map((k) => `${k}=${params.get(k)}`).join("&");
  const m = who?.member;
  const initials = m ? `${m.first_name[0] ?? ""}${m.last_name[0] ?? ""}`.toUpperCase() : "";

  return (
    <div className="flex min-h-screen">
      <aside className={cx("sticky top-0 hidden h-screen shrink-0 flex-col bg-chrome text-on-chrome transition-[width] duration-200 md:flex", collapsed ? "w-[68px]" : "w-60")}>
        <div className={cx("flex h-16 items-center border-b border-chrome-line", collapsed ? "justify-center" : "px-4")}>
          {collapsed ? <LogoMark size={34} /> : <LogoLockup light />}
        </div>
        <nav className="flex-1 space-y-0.5 p-2.5">
          {NAV.filter((n) => !n.admin || isAdmin).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={`${href}${keep ? `?${keep}` : ""}`} title={collapsed ? label : undefined}
                className={cx("group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active ? "bg-chrome-2 text-white" : "text-on-chrome-dim hover:bg-chrome-2/60 hover:text-white",
                  collapsed && "justify-center px-0")}>
                {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-amber" />}
                <Icon className={cx("h-[18px] w-[18px] shrink-0", active && "text-amber")} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-chrome-line p-2.5">
          {!collapsed && m && (
            <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-teal text-xs font-semibold text-white">{initials}</div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium text-white">{m.first_name} {m.last_name}</div>
                <div className="truncate text-[11px] capitalize text-on-chrome-dim">{who?.tenant?.name} · {m.role}</div>
              </div>
            </div>
          )}
          <div className={cx("flex gap-1", collapsed ? "flex-col items-center" : "items-center")}>
            <button onClick={toggleTheme} className="rounded-lg p-2 text-on-chrome-dim hover:bg-chrome-2 hover:text-white" title="Light / dark">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link href="/set-password" className="rounded-lg p-2 text-on-chrome-dim hover:bg-chrome-2 hover:text-white" title="Change password">
              <KeyRound className="h-4 w-4" />
            </Link>
            <a href="/auth/signout" className="rounded-lg p-2 text-on-chrome-dim hover:bg-chrome-2 hover:text-white" title="Sign out">
              <LogOut className="h-4 w-4" />
            </a>
            <button onClick={toggleNav} className={cx("rounded-lg p-2 text-on-chrome-dim hover:bg-chrome-2 hover:text-white", !collapsed && "ml-auto")} title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* phones: a top bar with the same destinations */}
        <div className="sticky top-0 z-30 flex items-center gap-2 overflow-x-auto bg-chrome px-3 py-2 md:hidden">
          <LogoMark size={28} />
          {NAV.filter((n) => !n.admin || isAdmin).map(({ href, label }) => (
            <Link key={href} href={`${href}${keep ? `?${keep}` : ""}`} className={cx("whitespace-nowrap rounded-md px-2.5 py-1 text-xs",
              (href === "/" ? path === "/" : path.startsWith(href)) ? "bg-chrome-2 text-white" : "text-on-chrome-dim")}>{label}</Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
