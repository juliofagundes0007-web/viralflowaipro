import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STATUS_BASE = "http://163.176.247.97:3000/status";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/video-status/$jobId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const { data: userData, error: userErr } =
          await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const userId = userData.user.id;

        const jobId = params.jobId;
        if (!jobId) {
          return new Response(JSON.stringify({ error: "jobId required" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        // Poll the external server
        let upstream: Record<string, unknown> = {};
        let upstreamStatus = 0;
        try {
          const res = await fetch(`${STATUS_BASE}/${encodeURIComponent(jobId)}`, {
            method: "GET",
          });
          upstreamStatus = res.status;
          const text = await res.text();
          try { upstream = text ? JSON.parse(text) : {}; } catch { upstream = { raw: text }; }
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }

        const status = String(upstream.status ?? "").toLowerCase();
        const videoUrl = (upstream.video_url as string) ?? null;
        const srtUrl = (upstream.srt_url as string) ?? null;
        const progress = typeof upstream.progress === "number" ? upstream.progress : null;

        // If done, persist video_url on the latest pending video for this user
        if (status === "done" && videoUrl) {
          const { data: video } = await supabaseAdmin
            .from("videos")
            .select("id")
            .eq("user_id", userId)
            .in("status", ["pending", "processing"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (video) {
            await supabaseAdmin
              .from("videos")
              .update({
                status: "completed",
                video_url: videoUrl,
              })
              .eq("id", video.id);
          }
          // Mark matching job as completed if we can locate by external_job_id
          await supabaseAdmin
            .from("video_jobs")
            .update({ status: "completed", progress: 100 })
            .eq("user_id", userId)
            .contains("payload", { external_job_id: jobId });
        }

        return new Response(
          JSON.stringify({
            ok: upstreamStatus >= 200 && upstreamStatus < 300,
            status,
            progress,
            video_url: videoUrl,
            srt_url: srtUrl,
            raw: upstream,
          }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
        );
      },
    },
  },
});
