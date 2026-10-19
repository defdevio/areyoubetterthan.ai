import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { ogLogoDataUri } from "@/lib/og-logo";
import { publicShare } from "@/lib/results";
import { closestModels } from "@/lib/share-links";

export const alt = "areyoubetterthan.ai results";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  await connection();
  const share = await publicShare(shareId);
  const s = share?.summary;
  const top = s ? closestModels(s.models, s.human.p, 4) : [];
  const logo = await ogLogoDataUri();
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#09090b", color: "#ececf1", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#9a9aa8" }}>
          <div style={{ display: "flex", width: 40, height: 40, borderRadius: 8, background: "#fbbf24", alignItems: "center", justifyContent: "center" }}><img src={logo} alt="" width={32} height={32} /></div>
          {/* Satori adds a gap at the span boundary, so pull .ai back */}
          <div style={{ display: "flex" }}>areyoubetterthan<span style={{ color: "#818cf8", marginLeft: -6 }}>.ai</span></div>
        </div>
        {s && share ? (
          <div style={{ display: "flex", flex: 1, marginTop: 40, gap: 56 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 40, color: "#9a9aa8" }}>{share.displayName}</div>
              <div style={{ fontSize: 150, fontWeight: 800, color: "#fbbf24", lineHeight: 1.05 }}>
                {`${Math.round((s.human.p ?? 0) * 100)}%`}
              </div>
              <div style={{ fontSize: 32, color: "#9a9aa8" }}>
                {`${s.human.k}/${s.human.n} real GitHub issues resolved`}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, marginTop: 28 }}>
                {`Beat ${s.beaten} of ${s.total_models} AI models`}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: 420, justifyContent: "center", gap: 22 }}>
              {top.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}>
                    <span>{m.model}</span>
                    <span style={{ color: "#818cf8" }}>{`${Math.round((m.rate.p ?? 0) * 100)}%`}</span>
                  </div>
                  <div style={{ display: "flex", height: 12, background: "#ffffff12", borderRadius: 6 }}>
                    <div style={{ width: `${(m.rate.p ?? 0) * 100}%`, background: "#818cf8", borderRadius: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 96, fontWeight: 800 }}>Are you better than AI?</div>
        )}
        <div style={{ display: "flex", fontSize: 24, color: "#6b6b78" }}>The human control group for SWE-bench Verified</div>
      </div>
    ),
    size,
  );
}
