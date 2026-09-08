import { ImageResponse } from "next/og";

/**
 * The card a link to the landing page unfurls into.
 *
 * Without this, a shared link shows a grey box or whatever the crawler
 * scrapes first. This is the hero, reduced to what survives at 600px in a
 * chat window: the sentence, the lit line, and one figure.
 *
 * System type only. Loading the display face here would mean fetching it at
 * build, which is a network dependency in the wrong place for a page that
 * must always render.
 */

export const alt =
  "Costbook — your menu, costed, and still costed when prices move";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SOOT = "#0F1219";
const SAFFRON = "#F5B335";
const RULE = "#262B36";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: SOOT,
        color: "#FFFFFF",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 26,
          fontWeight: 600,
        }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 20 20"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 16V8m4.7 8V4m4.6 12v-6M17 16V6" />
        </svg>
        Costbook
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1,
        }}
      >
        <div>Your menu, costed.</div>
        <div>And still costed</div>
        <div style={{ color: SAFFRON }}>when prices move.</div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderTop: `1px solid ${RULE}`,
          paddingTop: 26,
        }}
      >
        <div style={{ fontSize: 26, color: "#B4BBC9" }}>
          Recipe costing for one kitchen
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            fontSize: 26,
            color: "#B4BBC9",
          }}
        >
          <span>Onion</span>
          <span style={{ textDecoration: "line-through", color: "#7E879A" }}>
            42.00
          </span>
          <span style={{ color: "#7E879A" }}>→</span>
          <span style={{ color: SAFFRON, fontWeight: 700 }}>60.00</span>
          <span style={{ fontSize: 22 }}>· 11 dishes move</span>
        </div>
      </div>
    </div>,
    size,
  );
}
