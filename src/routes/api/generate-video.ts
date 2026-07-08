import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLATFORM_IDS = ["youtube", "instagram", "tiktok", "kwai", "pinterest", "rumble"] as const;

const PayloadSchema = z.object({
  niche: z.string().min(1).max(120),
  topic: z.string().min(1).max(500),
  prompt: z.string().max(4000).optional().default(""),
  reference_images: z.array(z.string().url()).max(6).optional().default([]),
  cta: z.string().max(200).optional().default(""),
  platform: z.enum(PLATFORM_IDS).default("youtube"),
  platforms: z.array(z.enum(PLATFORM_IDS)).max(6).optional().default([]),
  lang: z.string().max(10).optional().default("pt-f"),
  quantity: z.number().int().min(1).max(10).default(1),
  audio_url: z.string().url().optional(),
  image_count: z.number().int().min(1).max(20).optional().default(8),
});

const VIDEO_SERVER_URL = "http://163.176.247.97:3000/create-video";
const N8N_WEBHOOK_URL = "https://viralflowaipro.app.n8n.cloud/webhook/viralflow";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/generate-video")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const userId = userData.user.id;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const parsed = PayloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Validation failed", issues: parsed.error.issues }),
            { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }
        const {
          niche, topic, prompt, reference_images, cta,
          platform, platforms, quantity, audio_url, image_count,
        } = parsed.data;

        // 1) create job
        const { data: job, error: jobErr } = await supabaseAdmin
          .from("video_jobs")
          .insert({
            user_id: userId,
            niche,
            topic,
            theme: topic,
            prompt,
            reference_images,
            cta,
            platform,
            quantity,
            status: "pending",
            progress: 0,
          })
          .select()
          .single();
        if (jobErr || !job) {
          return new Response(
            JSON.stringify({ error: jobErr?.message ?? "Failed to create job" }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }

        // 2) placeholder videos
        const rows = Array.from({ length: quantity }).map((_, i) => ({
          user_id: userId,
          title: `${topic} #${i + 1}`,
          niche,
          theme: topic,
          platform,
          cta,
          status: "pending" as const,
        }));
        await supabaseAdmin.from("videos").insert(rows);

        // 3) dispatch to n8n orchestrator (n8n owns TTS + create-video)
        const script = (prompt && prompt.trim()) || topic;
        const n8nPayload = {
          job_id: job.id,
          user_id: userId,
          niche,
          topic,
          script,
          cta,
          prompt,
          platform,
          platforms: platforms.length ? platforms : [platform],
          quantity,
          reference_images,
          audio_url: audio_url ?? null,
          image_count,
          servers: {
            tts: "http://163.176.247.97:3000/tts",
            create_video: VIDEO_SERVER_URL,
          },
        };

        let externalJobId: string | null = null;
        let serverStatus: "queued" | "failed" = "failed";
        let serverError: string | null = null;
        try {
          const res = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(n8nPayload),
          });
          const text = await res.text();
          let json: Record<string, unknown> = {};
          try { json = text ? JSON.parse(text) : {}; } catch { /* keep raw */ }
          if (!res.ok) {
            serverError = `n8n returned ${res.status}: ${text.slice(0, 300)}`;
          } else {
            externalJobId =
              (json.job_id as string) ?? (json.id as string) ?? job.id;
            serverStatus = "queued";
          }
        } catch (e) {
          serverError = e instanceof Error ? e.message : String(e);
        }

        await supabaseAdmin
          .from("video_jobs")
          .update({
            status: serverStatus === "queued" ? "processing" : "failed",
            progress: serverStatus === "queued" ? 5 : 0,
            error_message: serverError,
            payload: {
              external_job_id: externalJobId,
              platforms: platforms.length ? platforms : [platform],
              server: "n8n:viralflow",
              sent: n8nPayload,
            },
          })
          .eq("id", job.id);

        await supabaseAdmin.from("automation_logs").insert({
          user_id: userId,
          job_id: job.id,
          level: serverStatus === "queued" ? "info" : "error",
          message:
            serverStatus === "queued"
              ? `n8n aceitou job ${externalJobId ?? "?"}`
              : `n8n falhou: ${serverError ?? "unknown"}`,
          metadata: { external_job_id: externalJobId, platform, niche },
        });

        return new Response(
          JSON.stringify({
            ok: serverStatus === "queued",
            job_id: job.id,
            external_job_id: externalJobId,
            status: serverStatus,
            error: serverError,
          }),
          {
            status: serverStatus === "queued" ? 200 : 502,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
