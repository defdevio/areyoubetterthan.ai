import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewClient } from "@/components/review/review-client";

export const metadata: Metadata = { title: "Review", robots: { index: false } };

async function ReviewLoader({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params;
  return <ReviewClient instanceId={decodeURIComponent(instanceId)} />;
}

export default function ReviewPage({ params }: PageProps<"/review/[instanceId]">) {
  return (
    <Suspense>
      <ReviewLoader params={params} />
    </Suspense>
  );
}
