"use client";

import { useEffect, useRef } from "react";

export default function Hero3D() {
  const ref = useRef<HTMLDivElement | null>(null);

  // Autospin + premium hover tilt
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let hovering = false;

    let tiltX = 0;
    let tiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;

    let spin = 18;
    const speedDegPerSec = 14;
    let last = performance.now();

    function animate(now: number) {
      const el = ref.current;
      if (!el) return; // ✅ prevents null access if unmounted

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      tiltX += (targetTiltX - tiltX) * 0.12;
      tiltY += (targetTiltY - tiltY) * 0.12;

      if (!prefersReduced && !hovering) {
        spin = (spin + speedDegPerSec * dt) % 360;
      }

      el.style.setProperty("--rx", `${tiltX.toFixed(3)}deg`);
      el.style.setProperty("--ry", `${tiltY.toFixed(3)}deg`);
      el.style.setProperty("--spin", `${spin.toFixed(3)}deg`);

      raf = requestAnimationFrame(animate);
    }

    function onEnter() {
      hovering = true;
    }

    function onLeave() {
      hovering = false;
      targetTiltX = 0;
      targetTiltY = 0;
    }

    function onMove(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;

      const rotY = (px - 0.5) * 10;
      const rotX = (0.5 - py) * 8;

      targetTiltX = rotX;
      targetTiltY = rotY;
    }

    // ✅ Use the stable node for add/remove so listeners match
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative mx-auto aspect-[4/3] w-full max-w-[520px] overflow-hidden rounded-[28px] glass lift"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* richer ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-28 h-[420px] w-[420px] rounded-full bg-purple-500/25 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[460px] w-[460px] rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute top-10 right-10 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(90% 80% at 15% 20%, rgba(168,85,247,0.28), transparent 60%), radial-gradient(70% 70% at 85% 30%, rgba(245,158,11,0.20), transparent 60%), radial-gradient(70% 80% at 55% 90%, rgba(236,72,153,0.18), transparent 60%)",
          }}
        />
        {/* subtle “stars” */}
        <div className="absolute inset-0 opacity-[0.12]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.9) 1px, transparent 2px), radial-gradient(circle at 72% 22%, rgba(255,255,255,0.7) 1px, transparent 2px), radial-gradient(circle at 40% 78%, rgba(255,255,255,0.6) 1px, transparent 2px), radial-gradient(circle at 84% 70%, rgba(255,255,255,0.5) 1px, transparent 2px), radial-gradient(circle at 18% 72%, rgba(255,255,255,0.45) 1px, transparent 2px)",
              backgroundSize: "420px 420px",
            }}
          />
        </div>
      </div>

      {/* 3D stage */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform:
            "perspective(1050px) rotateY(var(--spin, 0deg)) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
          transition: "transform 120ms ease",
          transformStyle: "preserve-3d",
        }}
      >
        {/* main prism */}
        <div className="relative h-[235px] w-[335px]" style={{ transformStyle: "preserve-3d" }}>
          {/* shadow */}
          <div
            className="absolute inset-0 rounded-[24px]"
            style={{
              transform: "translateZ(-64px) translateY(56px)",
              filter: "blur(26px)",
              background:
                "radial-gradient(60% 55% at 50% 50%, rgba(0,0,0,0.70), transparent 70%)",
              opacity: 0.72,
            }}
          />

          {/* FRONT face */}
          <Face depth={46} label="Veyra" />

          {/* BACK face (same as front) */}
          <Face depth={-46} rotateY={180} label="Veyra" />

          {/* LEFT face */}
          <div
            className="absolute inset-0 rounded-[24px] border border-white/10"
            style={{
              width: "92px",
              transformOrigin: "left center",
              transform: "rotateY(-90deg) translateX(-92px)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.30))",
              backfaceVisibility: "hidden",
            }}
          />

          {/* RIGHT face */}
          <div
            className="absolute inset-0 rounded-[24px] border border-white/10"
            style={{
              width: "92px",
              right: 0,
              left: "auto",
              transformOrigin: "right center",
              transform: "rotateY(90deg) translateX(92px)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.35))",
              backfaceVisibility: "hidden",
            }}
          />

          {/* BOTTOM face */}
          <div
            className="absolute inset-0 rounded-[24px] border border-white/10"
            style={{
              height: "92px",
              transformOrigin: "center bottom",
              transform: "rotateX(90deg) translateY(92px)",
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.42), rgba(255,255,255,0.08))",
              backfaceVisibility: "hidden",
            }}
          />

          {/* floating “ticket” card */}
          <div
            className="absolute right-[-22px] top-[64px] h-[156px] w-[102px] rounded-2xl border border-white/12 bg-black/25"
            style={{
              transform: "translateZ(86px) rotateY(16deg) rotateZ(7deg)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="p-3">
              <div
                className="h-10 w-10 rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(34,211,238,0.95), rgba(168,85,247,0.95), rgba(245,158,11,0.92))",
                }}
              />
              <div className="mt-3 text-[10px] text-white/80">Credibility</div>
              <div className="mt-1 text-xs font-semibold text-white">Verified</div>
              <div className="mt-4 h-7 rounded-lg bg-white/10" />
            </div>
          </div>

          {/* glossy light sweep */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[24px]"
            style={{
              transform: "translateZ(90px)",
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02), rgba(255,255,255,0.06))",
              opacity: 0.55,
              mixBlendMode: "screen",
              backfaceVisibility: "hidden",
            }}
          />
        </div>
      </div>

      {/* caption */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="text-sm text-white/80">Immersive credibility layer</div>
        <div className="text-xs text-white/60"></div>
      </div>
    </div>
  );
}

function Face({
  depth,
  rotateY,
  label,
}: {
  depth: number;
  rotateY?: number;
  label: string;
}) {
  return (
    <div
      className="absolute inset-0 rounded-[24px] border border-white/10"
      style={{
        transform: `translateZ(${depth}px) rotateY(${rotateY ?? 0}deg)`,
        background:
          "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(168,85,247,0.40), rgba(124,58,237,0.18), rgba(245,158,11,0.12))",
        boxShadow: "0 26px 70px rgba(0,0,0,0.55)",
        backfaceVisibility: "hidden",
      }}
    >
      {/* rings */}
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-6 top-6 h-24 w-24 rounded-full border border-white/10" />
        <div className="absolute left-10 top-10 h-40 w-40 rounded-full border border-white/10" />
        <div className="absolute -right-10 -bottom-10 h-56 w-56 rounded-full border border-white/10" />
      </div>

      {/* label */}
      <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/85">
        {label}
      </div>

      {/* stripe */}
      <div
        className="absolute bottom-0 left-0 right-0 h-14 rounded-b-[24px]"
        style={{
          background:
            "linear-gradient(90deg, rgba(34,211,238,0.55), rgba(245,158,11,0.55), rgba(168,85,247,0.55), rgba(124,58,237,0.45))",
          opacity: 0.88,
        }}
      />

      {/* inner glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[24px]"
        style={{
          background:
            "radial-gradient(70% 55% at 30% 25%, rgba(255,255,255,0.12), transparent 60%), radial-gradient(60% 50% at 80% 70%, rgba(255,255,255,0.08), transparent 60%)",
          opacity: 0.9,
        }}
      />
    </div>
  );
}
