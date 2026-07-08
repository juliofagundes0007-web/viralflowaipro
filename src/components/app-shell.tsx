import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Calendar,
  History,
  LayoutDashboard,
  LogOut,
  Plug,
  
  Settings,
  Shield,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { checkIsAdmin } from "@/lib/admin.functions";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generator", label: "Gerador", icon: Wand2 },
  { to: "/generation", label: "Processando", icon: Activity },
  { to: "/history", label: "Histórico", icon: History },
  { to: "/schedule", label: "Agenda", icon: Calendar },
  { to: "/settings/integrations", label: "Conectar redes", icon: Plug },
  { to: "/accounts", label: "Conta", icon: Settings },
] as const;


export function AppShell({ children, user }: { children: ReactNode; user: User }) {
  const router = useRouterState();
  const navigate = useNavigate();
  const path = router.location.pathname;

  const checkAdmin = useServerFn(checkIsAdmin);
  const { data: adminData } = useQuery({
    queryKey: ["isAdmin", user.id],
    queryFn: () => checkAdmin(),
    staleTime: 60_000,
  });

  const nav = useMemo(() => {
    const items: Array<{ to: string; label: string; icon: typeof LayoutDashboard }> = [...baseNav];
    if (adminData?.isAdmin) {
      items.push({ to: "/admin", label: "Admin", icon: Shield });
    }
    return items;
  }, [adminData?.isAdmin]);


  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-background grid md:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col border-r border-sidebar-border bg-sidebar">
        <div className="p-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-primary shadow-glow grid place-items-center">
              <Bot className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-lg">ViralFlow</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {nav.map((item) => {
            const active = path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="size-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between border-b border-border px-4 py-3 bg-sidebar sticky top-0 z-40">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-gradient-primary grid place-items-center">
            <Bot className="size-3.5 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold">ViralFlow</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="size-4" />
        </Button>
      </div>

      <main className="min-w-0">
        {children}
        {/* Mobile bottom nav */}
        <div className="md:hidden h-20" />
        <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-sidebar-border bg-sidebar/95 backdrop-blur z-40">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((item) => {
              const active = path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                    active ? "text-primary-glow" : "text-sidebar-foreground/70",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <div className="flex items-center gap-2 text-xs text-primary-glow mb-1">
          <Sparkles className="size-3" /> ViralFlow
        </div>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Client-side auth gate. Returns user once authenticated, redirects otherwise. */
export function useRequireAuth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login", replace: true });
      else setUser(session.user);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login", replace: true });
      else setUser(data.session.user);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return { user, loading };
}
