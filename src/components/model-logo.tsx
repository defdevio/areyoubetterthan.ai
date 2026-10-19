import {
  siAnthropic,
  siBytedance,
  siCursor,
  siDeepseek,
  siGooglegemini,
  siMeta,
  siMinimax,
  siMistralai,
  siMoonshotai,
  siNvidia,
  siQwen,
} from "simple-icons";

type VectorMark = { path: string; hex: string; viewBox?: string };
type ImageMark = { src: string };
type ShapeMark = {
  viewBox: string;
  shapes: { d: string; fill: string }[];
  evenodd?: boolean;
};
type Mark = VectorMark | ImageMark | ShapeMark;

// OpenAI has no simple-icons mark. This is the official Blossom from OpenAI's brand assets.
const OPENAI: VectorMark = {
  path: "M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399ZM470.899 244.776C486.892 260.77 493.488 282.601 490.687 303.412L415.577 260.046C412.411 258.218 408.509 258.218 405.345 260.046L317.401 310.82V277.526C317.401 275.191 318.652 273.005 320.676 271.837L387.644 233.174C414.178 218.353 448.346 222.223 470.901 244.776H470.899ZM357.837 311.144L398.275 334.491V381.185L357.837 404.532L317.398 381.185V334.491L357.837 311.144ZM264.776 269.693C265.207 239.305 285.644 211.649 316.453 203.393C338.3 197.54 360.505 202.744 377.127 215.573L302.014 258.937C298.848 260.764 296.898 264.144 296.898 267.798V369.346L268.065 352.699C266.043 351.531 264.776 349.353 264.776 347.017V269.691V269.693ZM203.391 316.454C209.244 294.608 224.854 277.978 244.276 269.999V356.73C244.276 360.384 246.226 363.763 249.392 365.591L337.337 416.365L308.503 433.013C306.481 434.181 303.961 434.188 301.939 433.02L234.971 394.357C208.868 378.789 195.138 347.261 203.391 316.454ZM244.775 470.9C228.781 454.906 222.186 433.075 224.986 412.264L300.096 455.63C303.263 457.457 307.164 457.457 310.328 455.63L398.273 404.856V438.149C398.273 440.485 397.022 442.671 394.997 443.839L328.029 482.502C301.495 497.322 267.327 493.452 244.772 470.9H244.775ZM450.897 445.982C450.466 476.371 430.029 504.027 399.22 512.283C377.373 518.136 355.168 512.932 338.547 500.102L413.659 456.738C416.826 454.911 418.775 451.532 418.775 447.877V346.329L447.609 362.977C449.631 364.145 450.897 366.323 450.897 368.659V445.985V445.982ZM512.282 399.221C506.429 421.068 490.819 437.697 471.397 445.676V358.946C471.397 355.292 469.448 351.912 466.281 350.085L378.336 299.311L407.17 282.663C409.192 281.495 411.712 281.487 413.734 282.655L480.702 321.318C506.805 336.887 520.536 368.415 512.282 399.221Z",
  hex: "ffffff",
  viewBox: "180.5 180.5 354.7 354.7",
};

// Z.ai's mark from its developer docs. The three white strokes are kept and the black tile is dropped.
const GLM: VectorMark = {
  path: "M82.771 33.208L75.0661 44.157C74.4609 45.0175 73.6581 45.7202 72.7251 46.2063C71.7922 46.6924 70.7562 46.9476 69.7043 46.9506H27.7104V33.1629L82.771 33.208Z M135.083 33.2075L68.9835 126.837H24.917L91.0167 33.2075H135.083Z M77.2741 126.837L85.024 115.843C85.6316 114.988 86.4359 114.292 87.3692 113.814C88.3025 113.336 89.3372 113.089 90.3859 113.095H132.335V126.612L77.2741 126.837Z",
  hex: "ffffff",
  viewBox: "24.917 24.917 110.166 110.166",
};

// SpaceXAI's Grok logomark from its brand assets. The two white swooshes are joined into one path.
const GROK: VectorMark = {
  path: "M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916 M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339",
  hex: "ffffff",
  viewBox: "0 0 1024 1024",
};

// Thinking Machines has no vector mark, only its favicon. It is a two-tone tile, so it is shown as-is.
const THINKING_MACHINES: ImageMark = {
  src: "/brand/thinking-machines-favicon-32x32.png",
};

// AWS's wordmark from Wikimedia Commons. The dark letters take the text color and the smile stays orange.
const AWS: ShapeMark = {
  viewBox: "0 0 304 182",
  shapes: [
    {
      d: "M86.4,66.4c0,3.7,0.4,6.7,1.1,8.9c0.8,2.2,1.8,4.6,3.2,7.2c0.5,0.8,0.7,1.6,0.7,2.3c0,1-0.6,2-1.9,3l-6.3,4.2 c-0.9,0.6-1.8,0.9-2.6,0.9c-1,0-2-0.5-3-1.4C76.2,90,75,88.4,74,86.8c-1-1.7-2-3.6-3.1-5.9c-7.8,9.2-17.6,13.8-29.4,13.8 c-8.4,0-15.1-2.4-20-7.2c-4.9-4.8-7.4-11.2-7.4-19.2c0-8.5,3-15.4,9.1-20.6c6.1-5.2,14.2-7.8,24.5-7.8c3.4,0,6.9,0.3,10.6,0.8 c3.7,0.5,7.5,1.3,11.5,2.2v-7.3c0-7.6-1.6-12.9-4.7-16c-3.2-3.1-8.6-4.6-16.3-4.6c-3.5,0-7.1,0.4-10.8,1.3c-3.7,0.9-7.3,2-10.8,3.4 c-1.6,0.7-2.8,1.1-3.5,1.3c-0.7,0.2-1.2,0.3-1.6,0.3c-1.4,0-2.1-1-2.1-3.1v-4.9c0-1.6,0.2-2.8,0.7-3.5c0.5-0.7,1.4-1.4,2.8-2.1 c3.5-1.8,7.7-3.3,12.6-4.5c4.9-1.3,10.1-1.9,15.6-1.9c11.9,0,20.6,2.7,26.2,8.1c5.5,5.4,8.3,13.6,8.3,24.6V66.4z M45.8,81.6 c3.3,0,6.7-0.6,10.3-1.8c3.6-1.2,6.8-3.4,9.5-6.4c1.6-1.9,2.8-4,3.4-6.4c0.6-2.4,1-5.3,1-8.7v-4.2c-2.9-0.7-6-1.3-9.2-1.7 c-3.2-0.4-6.3-0.6-9.4-0.6c-6.7,0-11.6,1.3-14.9,4c-3.3,2.7-4.9,6.5-4.9,11.5c0,4.7,1.2,8.2,3.7,10.6 C37.7,80.4,41.2,81.6,45.8,81.6z M126.1,92.4c-1.8,0-3-0.3-3.8-1c-0.8-0.6-1.5-2-2.1-3.9L96.7,10.2c-0.6-2-0.9-3.3-0.9-4 c0-1.6,0.8-2.5,2.4-2.5h9.8c1.9,0,3.2,0.3,3.9,1c0.8,0.6,1.4,2,2,3.9l16.8,66.2l15.6-66.2c0.5-2,1.1-3.3,1.9-3.9c0.8-0.6,2.2-1,4-1 h8c1.9,0,3.2,0.3,4,1c0.8,0.6,1.5,2,1.9,3.9l15.8,67l17.3-67c0.6-2,1.3-3.3,2-3.9c0.8-0.6,2.1-1,3.9-1h9.3c1.6,0,2.5,0.8,2.5,2.5 c0,0.5-0.1,1-0.2,1.6c-0.1,0.6-0.3,1.4-0.7,2.5l-24.1,77.3c-0.6,2-1.3,3.3-2.1,3.9c-0.8,0.6-2.1,1-3.8,1h-8.6c-1.9,0-3.2-0.3-4-1 c-0.8-0.7-1.5-2-1.9-4L156,23l-15.4,64.4c-0.5,2-1.1,3.3-1.9,4c-0.8,0.7-2.2,1-4,1H126.1z M254.6,95.1c-5.2,0-10.4-0.6-15.4-1.8 c-5-1.2-8.9-2.5-11.5-4c-1.6-0.9-2.7-1.9-3.1-2.8c-0.4-0.9-0.6-1.9-0.6-2.8v-5.1c0-2.1,0.8-3.1,2.3-3.1c0.6,0,1.2,0.1,1.8,0.3 c0.6,0.2,1.5,0.6,2.5,1c3.4,1.5,7.1,2.7,11,3.5c4,0.8,7.9,1.2,11.9,1.2c6.3,0,11.2-1.1,14.6-3.3c3.4-2.2,5.2-5.4,5.2-9.5 c0-2.8-0.9-5.1-2.7-7c-1.8-1.9-5.2-3.6-10.1-5.2L246,52c-7.3-2.3-12.7-5.7-16-10.2c-3.3-4.4-5-9.3-5-14.5c0-4.2,0.9-7.9,2.7-11.1 c1.8-3.2,4.2-6,7.2-8.2c3-2.3,6.4-4,10.4-5.2c4-1.2,8.2-1.7,12.6-1.7c2.2,0,4.5,0.1,6.7,0.4c2.3,0.3,4.4,0.7,6.5,1.1 c2,0.5,3.9,1,5.7,1.6c1.8,0.6,3.2,1.2,4.2,1.8c1.4,0.8,2.4,1.6,3,2.5c0.6,0.8,0.9,1.9,0.9,3.3v4.7c0,2.1-0.8,3.2-2.3,3.2 c-0.8,0-2.1-0.4-3.8-1.2c-5.7-2.6-12.1-3.9-19.2-3.9c-5.7,0-10.2,0.9-13.3,2.8c-3.1,1.9-4.7,4.8-4.7,8.9c0,2.8,1,5.2,3,7.1 c2,1.9,5.7,3.8,11,5.5l14.2,4.5c7.2,2.3,12.4,5.5,15.5,9.6c3.1,4.1,4.6,8.8,4.6,14c0,4.3-0.9,8.2-2.6,11.6 c-1.8,3.4-4.2,6.4-7.3,8.8c-3.1,2.5-6.8,4.3-11.1,5.6C264.4,94.4,259.7,95.1,254.6,95.1z",
      fill: "currentColor",
    },
    {
      d: "M273.5,143.7c-32.9,24.3-80.7,37.2-121.8,37.2c-57.6,0-109.5-21.3-148.7-56.7c-3.1-2.8-0.3-6.6,3.4-4.4 c42.4,24.6,94.7,39.5,148.8,39.5c36.5,0,76.6-7.6,113.5-23.2C274.2,133.6,278.9,139.7,273.5,143.7z",
      fill: "#FF9900",
    },
    {
      d: "M287.2,128.1c-4.2-5.4-27.8-2.6-38.5-1.3c-3.2,0.4-3.7-2.4-0.8-4.5c18.8-13.2,49.7-9.4,53.3-5 c3.6,4.5-1,35.4-18.6,50.2c-2.7,2.3-5.3,1.1-4.1-1.9C282.5,155.7,291.4,133.4,287.2,128.1z",
      fill: "#FF9900",
    },
  ],
};

// Microsoft's four-square logo from Wikimedia Commons. The gray backdrop square is dropped.
const MICROSOFT: ShapeMark = {
  viewBox: "1 1 21 21",
  shapes: [
    { d: "M1 1h10v10H1z", fill: "#f35325" },
    { d: "M12 1h10v10H12z", fill: "#81bc06" },
    { d: "M1 12h10v10H1z", fill: "#05a6f0" },
    { d: "M12 12h10v10H12z", fill: "#ffba08" },
  ],
};

// Used for orgs without a vendor mark. It is a plain ring with a dot, drawn here and not taken from any company.
const GENERIC: ShapeMark = {
  viewBox: "0 0 24 24",
  shapes: [
    {
      d: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0zM6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0z",
      fill: "currentColor",
    },
  ],
  evenodd: true,
};

const HUMAN: ShapeMark = {
  viewBox: "0 0 24 24",
  shapes: [
    { d: "M12 3a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z", fill: "currentColor" },
    { d: "M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z", fill: "currentColor" },
  ],
};

// Keys are lowercased, trimmed org names. The data isn't normalized, so several spellings map to one mark.
const MARKS: Record<string, Mark> = {
  openai: OPENAI,
  microsoft: MICROSOFT,
  aws: AWS,
  "amazon nova": AWS,
  spacexai: GROK,
  thinkingmachines: THINKING_MACHINES,
  "z-ai": GLM,
  "z.ai": GLM,
  "zhipu ai": GLM,
  anthropic: siAnthropic,
  deepseek: siDeepseek,
  "google deepmind": siGooglegemini,
  google: siGooglegemini,
  meta: siMeta,
  qwen: siQwen,
  alibaba: siQwen,
  mistral: siMistralai,
  "mistral ai": siMistralai,
  "moonshot ai": siMoonshotai,
  minimax: siMinimax,
  bytedance: siBytedance,
  nvidia: siNvidia,
  cursor: siCursor,
};

function luminance(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black and white marks would vanish against one of the two backgrounds, so they take the text color. */
function fillFor({ hex }: VectorMark) {
  const lum = luminance(hex);
  return lum < 60 || lum > 200 ? "currentColor" : `#${hex}`;
}

/** The vendor's mark in a fixed square. Empty for humans (no org); orgs without a mark get the generic placeholder. */
export function ModelLogo({
  org,
  human = false,
  className = "mr-2 size-4",
}: {
  org: string | null | undefined;
  human?: boolean;
  className?: string;
}) {
  const key = org?.trim().toLowerCase();
  const mark = human ? HUMAN : key ? (MARKS[key] ?? GENERIC) : undefined;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle ${human ? "text-human " : ""}${className}`}
      aria-hidden="true"
    >
      {mark && "src" in mark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mark.src} alt="" className="size-full object-contain" />
      )}
      {mark && "path" in mark && (
        <svg viewBox={mark.viewBox ?? "0 0 24 24"} className="size-full">
          <path d={mark.path} fill={fillFor(mark)} />
        </svg>
      )}
      {mark && "shapes" in mark && (
        <svg viewBox={mark.viewBox} className="size-full">
          {mark.shapes.map((shape) => (
            <path
              key={shape.d}
              d={shape.d}
              fill={shape.fill}
              fillRule={mark.evenodd ? "evenodd" : undefined}
            />
          ))}
        </svg>
      )}
    </span>
  );
}
