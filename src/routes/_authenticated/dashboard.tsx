import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AlertTriangle, Calendar, CheckCircle2, Loader2, Radio, Video } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ViralFlow" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [videos, jobs, scheduled, accounts] = await Promise.all([
        supabase.from("videos").select("id, status"),
        supabase.from("video_jobs").select("id, status"),
        supabase.from("scheduled_posts").select("id").eq("status", "scheduled"),
        supabase.from("connected_accounts").select("id, platform"),
      ]);
      const v = videos.data ?? [];
      const j = jobs.data ?? [];
      return {
        totalVideos: v.length,
        produced: v.filter((x) => ["ready", "completed", "posted"].includes(x.status)).length,
        published: v.filter((x) => x.status === "posted").length,
        queued: j.filter((x) => ["pending", "queued"].includes(x.status)).length,
        processing: j.filter((x) => x.status === "processing").length,
        errors: j.filter((x) => ["failed", "error"].includes(x.status)).length,
        scheduled: scheduled.data?.length ?? 0,
        accounts: accounts.data?.length ?? 0,
      };
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    let uid: string | null = null;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      uid = u.user.id;
      ch = supabase
        .channel(`dash:${uid}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "videos", filter: `user_id=eq.${uid}` },
          () => qc.invalidateQueries({ queryKey: ["dashboard-stats"] }))
        .on("postgres_changes",
          { event: "*", schema: "public", table: "video_jobs", filter: `user_id=eq.${uid}` },
          () => qc.invalidateQueries({ queryKey: ["dashboard-stats"] }))
        .subscribe();
    })();
    return () => { if (ch) supabase.removeChannel(ch); };
  }, [qc]);

  const stats = [
    { icon: Video, label: "Vídeos produzidos", value: data?.produced ?? 0, color: "text-primary-glow" },
    { icon: CheckCircle2, label: "Publicados", value: data?.published ?? 0, color: "text-success" },
    { icon: Loader2, label: "Na fila", value: data?.queued ?? 0, color: "text-warning" },
    { icon: Radio, label: "Processando", value: data?.processing ?? 0, color: "text-primary-glow" },
    { icon: Calendar, label: "Agendados", value: data?.scheduled ?? 0, color: "text-primary-glow" },
    { icon: AlertTriangle, label: "Erros", value: data?.errors ?? 0, color: "text-destructive" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Dashboard" subtitle="A IA cria. Você monetiza." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-6 bg-gradient-surface border-border/60 shadow-card">
            <div className={`size-10 rounded-lg bg-accent/40 grid place-items-center mb-3 ${s.color}`}>
              <s.icon className="size-5" />
            </div>
            <div className="text-3xl font-display font-semibold">{s.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-4">
        <Card className="p-6 bg-gradient-surface border-border/60 shadow-card">
          <h3 className="font-display font-semibold mb-1">Redes conectadas</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {data?.accounts ?? 0} conta(s) ativa(s)
          </p>
          <p className="text-xs text-muted-foreground">
            Conecte YouTube e TikTok em <strong>Conectar redes</strong> para publicar automaticamente.
          </p>
        </Card>
        <Card className="p-6 bg-gradient-surface border-border/60 shadow-card">
          <h3 className="font-display font-semibold mb-1">Próximo passo</h3>
          <p className="text-sm text-muted-foreground">
            Vá para o <strong>Gerador</strong>, escolha um objetivo e deixe a IA produzir seu próximo lote.
          </p>
        </Card>
      </div>
    </div>
  );
}
