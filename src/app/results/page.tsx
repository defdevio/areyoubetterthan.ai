import type { Metadata } from "next";
import { ResultsClient } from "@/components/results/results-client";

export const metadata: Metadata = { title: "My results" };

export default function ResultsPage() {
  return <ResultsClient />;
}
