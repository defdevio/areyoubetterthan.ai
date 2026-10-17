import type { Metadata } from "next";
import { PlayClient } from "@/components/play/play-client";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return <PlayClient />;
}
