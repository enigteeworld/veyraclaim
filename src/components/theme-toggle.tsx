"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";

import { Button } from "@/components/ui/button";

type Mode = "light" | "dark" | "system";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  // avoid hydration mismatch
  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="rounded-xl">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const mode = (theme ?? "system") as Mode;
  const resolved = mode === "system" ? (systemTheme as Mode) : mode;

  const Icon = resolved === "dark" ? Moon : Sun;

  function pick(next: Mode) {
    setTheme(next);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Theme"
      >
        <Icon className="h-4 w-4" />
      </Button>

      {open && (
        <>
          {/* click-away */}
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close theme menu"
          />

          <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            <button
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
                mode === "light" ? "bg-muted" : ""
              }`}
              onClick={() => pick("light")}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>

            <button
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
                mode === "dark" ? "bg-muted" : ""
              }`}
              onClick={() => pick("dark")}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>

            <button
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
                mode === "system" ? "bg-muted" : ""
              }`}
              onClick={() => pick("system")}
            >
              <Laptop className="h-4 w-4" />
              System
            </button>
          </div>
        </>
      )}
    </div>
  );
}
