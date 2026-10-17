import { ImageResponse } from "next/og";

export const alt = "Are you better than AI? The human control group for SWE-bench";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: "#09090b", color: "#ececf1", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: "#9a9aa8" }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 8, background: "#fbbf24", color: "#000", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>?</div>
          areyoubetterthan<span style={{ color: "#818cf8" }}>.ai</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 1.05 }}>Are you better</div>
          <div style={{ display: "flex", fontSize: 110, fontWeight: 800, lineHeight: 1.05 }}>
            than&nbsp;<span style={{ color: "#818cf8" }}>AI</span>?
          </div>
        </div>
        <div style={{ fontSize: 30, color: "#9a9aa8" }}>
          Real GitHub issues from SWE-bench Verified · 15 minutes · graded by the official harness
        </div>
      </div>
    ),
    size,
  );
}
