// src/app/tg/layout.tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "Veyra Mini App",
};

export default function TgLayout({ children }: { children: ReactNode }) {
  // IMPORTANT:
  // This layout intentionally renders ONLY the mini app.
  // No global site header/footer, no theme toggle, no "FairClaim" top bar.
  return <>{children}</>;
}
