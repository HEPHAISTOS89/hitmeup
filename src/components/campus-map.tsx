"use client";

import dynamic from "next/dynamic";
import type { Service } from "@/lib/types";

const CampusMapClient = dynamic(() => import("./campus-map-client"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      <span className="map-loading-mark" />
      <span>Mapping nearby student services…</span>
    </div>
  ),
});

export function CampusMap({
  services,
  selectedId,
  recenterKey,
  onSelect,
}: {
  services: Service[];
  selectedId?: string;
  recenterKey: number;
  onSelect: (id: string) => void;
}) {
  return (
    <CampusMapClient
      services={services}
      selectedId={selectedId}
      recenterKey={recenterKey}
      onSelect={onSelect}
    />
  );
}
