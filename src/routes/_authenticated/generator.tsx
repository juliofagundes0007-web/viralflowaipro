import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ChangeEvent } from "react";
import {
  Wand2,
  Loader2,
  ImagePlus,
  X,
  Sparkles,
  Lock,
  CheckCircle2,
  Youtube,
  Instagram,
  Music2,
  Video,
  Pin,
  Flame,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/generator")({
  head: () => ({ meta: [{ title: "Gerador — ViralFlow" }] }),
  component: Generator,
});

const MAX_IMAGES = 6;
const MAX_PLATFORMS = 6;

const PLATFORM_META = [
  { id: "youtube", name: "YouTube", icon: Youtube, color: "text-red-500" },
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-pink-500" },
  { id: "tiktok", name: "TikTok", icon: Music2, color: "text-foreground" },
  { id: "kwai", name: "Kwai", icon: Video, color: "text-orange-500" },
  { id: "pinterest", name: "Pinterest", icon: Pin, color: "text-rose-500" },
  { id: "rumble", name: "Rumble", icon: Flame, color: "text-emerald-500" },
] as const;

const OBJECTIVES = [
  { id: "monetize", label: "Monetizar Canal" },
  { id: "sell", label: "Vender Produto" },
  { id: "grow", label: "Crescer Perfil" },
  { id: "leads", label: "Gerar Leads" },
  { id: "traffic", label: "Tráfego" },
  { id: "auto", label: "Automatizar Conteúdo" },
] as const;

function Generator() {
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [objective, setObjective] = useState<string>("monetize");
  const [niche, setNiche] = useState("");
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cta, setCta] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pollState, setPollState] = useState<{
    status: string;
    progress: number | null;
    video_url: string | null;
    srt_url: string | null;
  } | null>(null);

  const { data: keys } = useQuery({
    queryKey: ["my-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("provider, api_key, status");
      if (error) throw error;
      return data;
    },
  });

  const isConnected = (id: string) =>
    !!keys?.find((k) => k.provider === id && k.api_key && k.status === "active");

  const togglePlatform = (id: string) => {
    if (!isConnected(id)) {
      toast.error("Configure a API desta plataforma em Minhas APIs.");
      return;
    }
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_PLATFORMS) {
        toast.warning(`Máximo de ${MAX_PLATFORMS} plataformas.`);
        return prev;
      }
      return [...prev, id];
    });
  };


  const onPickImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`Máximo de ${MAX_IMAGES} imagens.`);
      return;
    }
    const picked = files.slice(0, room);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Sessão expirada.");
      return;
    }
    setUploading(true);
    const uploaded: { path: string; url: string }[] = [];
    try {
      for (const file of picked) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} excede 8MB.`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${u.user.id}/refs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("user-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`Falha ao enviar ${file.name}: ${upErr.message}`);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("user-media")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) uploaded.push({ path, url: signed.signedUrl });
      }
      setImages((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (idx: number) => {
    const target = images[idx];
    setImages((prev) => prev.filter((_, i) => i !== idx));
    if (target?.path) await supabase.storage.from("user-media").remove([target.path]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !niche.trim()) {
      toast.error("Preencha nicho e tópico.");
      return;
    }
    if (selected.length < 1) {
      toast.error("Selecione ao menos 1 plataforma.");
      return;
    }

    setSubmitting(true);
    setPollState(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada.");
        return;
      }
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          niche,
          topic,
          prompt,
          cta,
          platform: selected[0],
          platforms: selected,
          quantity,
          reference_images: images.map((i) => i.url),
          image_count: 8,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.external_job_id) {
        toast.error(json.error ?? "Falha ao disparar geração.");
        return;
      }
      const externalId: string = json.external_job_id;
      toast.success(`Job enviado (${externalId.slice(0, 8)}…). Aguardando vídeo…`);
      setPollState({ status: "processing", progress: 0, video_url: null, srt_url: null });

      // Polling every 4s, up to ~10 min
      const start = Date.now();
      const maxMs = 10 * 60 * 1000;
      while (Date.now() - start < maxMs) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const sres = await fetch(`/api/video-status/${encodeURIComponent(externalId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const sjson = await sres.json();
          setPollState({
            status: sjson.status ?? "processing",
            progress: sjson.progress ?? null,
            video_url: sjson.video_url ?? null,
            srt_url: sjson.srt_url ?? null,
          });
          if (sjson.status === "done" && sjson.video_url) {
            toast.success("Vídeo pronto!");
            break;
          }
          if (sjson.status === "failed" || sjson.status === "error") {
            toast.error("Falha ao gerar vídeo no servidor.");
            break;
          }
        } catch {
          // keep polling
        }
      }

      setPrompt("");
      setImages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Gerador"
        subtitle="Descreva o vídeo, envie referências e dispare o pipeline automatizado"
      />

      <Card className="p-6 bg-gradient-surface border-border/60 shadow-card">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="niche">Nicho</Label>
              <Input
                id="niche"
                required
                placeholder="Ex: produtividade, curiosidades"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Tópico / título</Label>
              <Input
                id="topic"
                required
                placeholder="Ex: 3 hábitos de quem acorda às 5h"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt" className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary-glow" />
              Prompt do vídeo
            </Label>
            <Textarea
              id="prompt"
              rows={5}
              placeholder="Descreva como deve ser o vídeo: roteiro, estilo visual, narração, ritmo, mood…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ImagePlus className="size-4 text-primary-glow" />
                Imagens de referência
              </span>
              <span className="text-xs text-muted-foreground">
                {images.length}/{MAX_IMAGES}
              </span>
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {images.map((img, idx) => (
                <div
                  key={img.path}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border/60 group"
                >
                  <img src={img.url} alt={`ref ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center opacity-0 group-hover:opacity-100 transition"
                    aria-label="Remover"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label className="aspect-square rounded-lg border border-dashed border-border/60 grid place-items-center cursor-pointer hover:bg-muted/30 transition">
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={onPickImages}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Platform selection — qualquer quantidade (1 ou mais) */}
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Publicar em (1 ou mais)</span>
              <span className="text-xs text-muted-foreground">
                {selected.length}/{MAX_PLATFORMS}
              </span>
            </Label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PLATFORM_META.map((p) => {
                const connected = isConnected(p.id);
                const active = selected.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-left transition",
                      active
                        ? "border-primary bg-primary/10 shadow-glow"
                        : "border-border/60 hover:bg-muted/30",
                      !connected && "opacity-60",
                    )}
                  >
                    <p.icon className={`size-4 ${p.color}`} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {!connected ? (
                      <Lock className="size-3.5 text-muted-foreground" />
                    ) : active ? (
                      <CheckCircle2 className="size-4 text-primary-glow" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 mt-2">
                <div className="text-xs text-muted-foreground mb-2">Pré-visualização</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {selected.map((id) => {
                    const meta = PLATFORM_META.find((p) => p.id === id)!;
                    return (
                      <div
                        key={id}
                        className="rounded-md border border-border/60 bg-card p-2"
                      >
                        <div className="aspect-[9/16] rounded bg-muted/40 grid place-items-center mb-1.5">
                          <meta.icon className={`size-6 ${meta.color}`} />
                        </div>
                        <div className="text-[11px] font-medium truncate">
                          {topic || "Seu título"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{meta.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {keys && keys.length === 0 && (
              <Link to="/settings/integrations" className="text-xs text-primary-glow hover:underline">
                Você ainda não cadastrou nenhuma API → configurar agora
              </Link>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qty">Quantidade</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta">CTA (opcional)</Label>
              <Input
                id="cta"
                placeholder="Segue para mais!"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting || uploading}
            className="w-full bg-gradient-primary shadow-glow"
          >
            {submitting ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> Disparando pipeline...</>
            ) : (
              <><Wand2 className="size-4 mr-2" /> Gerar vídeo</>
            )}
          </Button>
        </form>
      </Card>

      {pollState && (
        <Card className="p-6 bg-gradient-surface border-border/60 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-display text-base">Status da geração</div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-glow">
              {pollState.status}
            </span>
          </div>
          {pollState.status !== "done" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Processando no servidor de vídeo… {pollState.progress != null ? `${pollState.progress}%` : ""}
            </div>
          )}
          {pollState.video_url && (
            <div className="space-y-2">
              <video
                src={pollState.video_url}
                controls
                className="w-full rounded-lg border border-border/60 bg-black"
              />
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  href={pollState.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-glow hover:underline"
                >
                  Baixar vídeo
                </a>
                {pollState.srt_url && (
                  <a
                    href={pollState.srt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-glow hover:underline"
                  >
                    Baixar legenda (.srt)
                  </a>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
