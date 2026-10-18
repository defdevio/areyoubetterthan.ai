"use client";

import { alpha2ToNumeric } from "i18n-iso-countries";
import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, type GeographiesProps } from "react-simple-maps";
import world from "world-atlas/countries-110m.json";
import { CountryFlag } from "@/components/country-flag";
import type { CountryStanding } from "@/lib/country-standings";
import { pct } from "@/lib/stats";

const NEUTRAL = { fill: "var(--color-panel-2)", stroke: "var(--color-line)", strokeWidth: 0.4, outline: "none" } as const;
// Mercator cannot draw Antarctica's polar extent, so it is omitted.
const ANTARCTICA = "010";

/** World map shaded by each country's average skill. Hovering shows that country's numbers. */
export function CountryMap({ countries }: { countries: CountryStanding[] }) {
  const [hovered, setHovered] = useState<CountryStanding | null>(null);

  const byNumeric = useMemo(() => {
    const m = new Map<string, CountryStanding>();
    for (const c of countries) {
      const id = alpha2ToNumeric(c.code);
      if (id) m.set(id, c);
    }
    return m;
  }, [countries]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 120, center: [0, 43.6] }}
          width={800}
          height={540}
          style={{ width: "100%", height: "auto" }}
        >
          {/* world-atlas ships TopoJSON; react-simple-maps converts it at runtime but types only accept GeoJSON. */}
          <Geographies geography={world as unknown as GeographiesProps["geography"]}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.id !== ANTARCTICA)
                .map((geo) => {
                  const standing = byNumeric.get(String(geo.id));
                  const active = standing !== undefined && hovered?.code === standing.code;
                  const style = standing
                    ? {
                        fill: "var(--color-human)",
                        fillOpacity: active ? 1 : 0.15 + 0.85 * standing.avgSkill,
                        stroke: active ? "var(--color-fg)" : "var(--color-bg)",
                        strokeWidth: 0.4,
                        outline: "none",
                      }
                    : NEUTRAL;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHovered(standing ?? null)}
                      onMouseLeave={() => setHovered(null)}
                      style={style}
                    />
                  );
                })
            }
          </Geographies>
        </ComposableMap>
      </div>
      <div className="mt-2 min-h-5 text-center text-xs text-muted" data-testid="country-readout">
        {hovered ? (
          <>
            <CountryFlag code={hovered.code} className="mr-2 align-middle text-[0.85em]" />
            {`${hovered.name} · avg ${pct(hovered.avgSkill, 1)} · ${hovered.count} ranked ${hovered.count === 1 ? "human" : "humans"}`}
          </>
        ) : (
          "Hover a country to see its average skill"
        )}
      </div>
    </div>
  );
}
