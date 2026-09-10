"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useOauthConnectionCallbackMutation } from "@/lib/redux/api";

export default function OAuthCallbackPage() {
  const params = useParams<{ channel: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [callback, { isLoading }] = useOauthConnectionCallbackMutation();
  const [message, setMessage] = useState("Finishing connection…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const channel = (params.channel ?? "").toUpperCase() as "LINKEDIN" | "FACEBOOK" | "INSTAGRAM";
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const redirect = () => {
      setTimeout(() => router.replace("/connections"), 1500);
    };

    if (!["LINKEDIN", "FACEBOOK", "INSTAGRAM"].includes(channel)) {
      setMessage("Unsupported channel. Something went wrong.");
      redirect();
      return;
    }

    if (error || !code || !state) {
      setMessage(errorDescription ? `Connection failed: ${errorDescription}` : "Connection was cancelled or failed.");
      redirect();
      return;
    }

    void (async () => {
      try {
        await callback({ channel, code, state }).unwrap();
        setMessage("Connected! Redirecting to Channels…");
      } catch (err) {
        const detail = typeof err === "object" && err !== null && "data" in err
          ? ((err as { data?: { error?: string } }).data?.error ?? "")
          : "";
        setMessage(`Connection failed${detail ? `: ${detail}` : "."}`);
      } finally {
        redirect();
      }
    })();
  }, [callback, params.channel, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p className="text-sm text-fg-muted">{isLoading ? "Finishing connection…" : message}</p>
      </div>
    </div>
  );
}