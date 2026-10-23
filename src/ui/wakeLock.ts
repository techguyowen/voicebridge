import { useEffect } from "react";

interface WakeLockHandle {
  release(): Promise<void>;
}

export const MP4_SILENT =
  "data:video/mp4;base64,AAAAHGZ0eXBNNFYgAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthABGWAAAAABAAA2Z2VzZHMAAAAAAQABAAEAAAA2YXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAc3R0cwAAAAAAAAABAAAAAQABAAABAAAAHHN0c2QAAAAAAAAAAQAAAFhzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAABoc3RzegAAAAAAAAAAAAAAAQAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGB1ZHRhAAAAWG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAAK2lsc3QAAAAjqXRvbwAAABtkYXRhAAAAAQAAAABMYXZmYzgxLjEyLjEwMA==";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let lock: WakeLockHandle | null = null;
    let cancelled = false;
    let videoEl: HTMLVideoElement | null = null;

    const playVideo = (): void => {
      if (videoEl && videoEl.paused && !cancelled) {
        videoEl.play().catch(() => {});
      }
    };

    const startVideoFallback = (): void => {
      if (videoEl || cancelled) return;
      try {
        const video = document.createElement("video");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.muted = true;
        video.loop = true;
        video.src = MP4_SILENT;
        video.style.position = "fixed";
        video.style.top = "-9999px";
        video.style.left = "-9999px";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0.001";
        video.style.pointerEvents = "none";
        document.body.appendChild(video);
        videoEl = video;

        playVideo();
        window.addEventListener("touchstart", playVideo, { passive: true });
        window.addEventListener("click", playVideo, { passive: true });
      } catch {
        // Fallback error safely ignored
      }
    };

    const requestWakeLock = async (): Promise<void> => {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          const wl = (navigator as Navigator & { wakeLock: { request(t: string): Promise<WakeLockHandle> } }).wakeLock;
          const handle = await wl.request("screen");
          if (cancelled) {
            await handle.release();
          } else {
            lock = handle;
          }
          return;
        } catch {
          // Screen wake lock rejected or unavailable; trigger video fallback
        }
      }
      startVideoFallback();
    };

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        playVideo();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("touchstart", playVideo);
      window.removeEventListener("click", playVideo);
      if (lock) {
        void lock.release();
        lock = null;
      }
      if (videoEl) {
        try {
          videoEl.pause();
          videoEl.src = "";
          videoEl.remove();
        } catch {}
        videoEl = null;
      }
    };
  }, [active]);
}
