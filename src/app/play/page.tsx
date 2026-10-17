import type { Metadata } from "next";
import { DesktopGate } from "@/components/play/desktop-gate";
import { PlayClient } from "@/components/play/play-client";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return (
    <DesktopGate>
      <PlayClient />
    </DesktopGate>
  );
}
