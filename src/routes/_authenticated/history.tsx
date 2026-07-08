import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ExternalLink, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico — ViralFlow" }] }),
  component: History,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Em processamento",
  processing: "Produzindo",
  ready: "Produzido",
  publishing: "Publicando",
  posted: "Publicado",
  completed: "Produzido",
  failed: "Erro",
  error: "Erro",
};

const statusColor: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  processing: "bg-primary/20 text-primary-glow",
  publishing: "bg-primary/20 text-primary-glow",
  ready: "bg-success/20 text-success",
  completed: "bg-success/20 text-success",
  posted: "bg-success/20 text-success",
  failed: "bg-destructive/20 text-destructive",
  error: "bg-destructive/20 text-destructive",
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function History() {
  const qc = useQueryClient();
  const { data: videos } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    let uid: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      uid = u.user.id;
      channel = supabase
        .channel(`history:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "videos", filter: `user_id=eq.${uid}` },
          () => qc.invalidateQueries({ queryKey: ["videos"] }),
        )
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [qc]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Vídeo removido");
      qc.invalidateQueries({ queryKey: ["videos"] });
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Histórico" subtitle="Acompanhe cada vídeo em tempo real" />
      {!videos?.length ? (
        <Card className="p-12 text-center bg-gradient-surface border-border/60">
          <Video className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum vídeo ainda. Vá ao Gerador para começar.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <Card key={v.id} className="overflow-hidden bg-gradient-surface border-border/60 shadow-card">
              <div className="aspect-[9/16] bg-accent/30 grid place-items-center relative">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
                ) : (
                  <Video className="size-10 text-muted-foreground" />
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm truncate flex-1">{v.title}</h3>
                  <Badge className={statusColor[v.status] ?? "bg-muted"}>
                    {STATUS_LABEL[v.status] ?? v.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {v.niche} · {v.platform}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {fmt(v.created_at)}
                </div>
                {v.video_url && (
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary-glow hover:underline"
                  >
                    <ExternalLink className="size-3" /> Abrir publicação
                  </a>
                )}
                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="flex-1" disabled={!v.video_url}>
                    {v.video_url ? (
                      <a href={v.video_url} target="_blank" rel="noreferrer">Baixar</a>
                    ) : (
                      <span>Baixar</span>
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(v.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
