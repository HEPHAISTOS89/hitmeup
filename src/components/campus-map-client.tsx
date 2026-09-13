"use client";

import { AttributionControl, Map as MapLibreMap, Marker as MapLibreMarker, Popup, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { PartyPopper, Wrench, GraduationCap, Briefcase, HeartHandshake, Gamepad2, Dumbbell, Ticket, Store, HandHelping, type LucideIcon } from "lucide-react";
import type { Service, ServiceCategory } from "@/lib/types";
import { CAMPUS_CENTER } from "@/lib/service-catalog";
import { categoryDefinition } from "@/lib/service-taxonomy";

export const DEFAULT_LIGHT_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DEFAULT_DARK_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export const MAPLIBRE_WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";
const TRANSPARENT_STYLE_IMAGE = {
  width: 1,
  height: 1,
  data: new Uint8Array([0, 0, 0, 0]),
};

type MapPhase = "loading" | "ready" | "fallback";
type MapFallbackReason = "offline" | "style";
type MarkerRecord = {
  marker: MapLibreMarker;
  element: HTMLDivElement;
  button: HTMLButtonElement;
};

const CATEGORY_MARKERS: Record<ServiceCategory, { glyph: string; slug: string }> = {
  Social: { glyph: "✦", slug: "social" },
  Services: { glyph: "⌁", slug: "services" },
  Tutoring: { glyph: "Σ", slug: "tutoring" },
  Jobs: { glyph: "$", slug: "jobs" },
  Volunteer: { glyph: "♡", slug: "volunteer" },
  Clubs: { glyph: "♟", slug: "clubs" },
  Activities: { glyph: "↗", slug: "activities" },
  Events: { glyph: "◇", slug: "events" },
  Businesses: { glyph: "▣", slug: "businesses" },
  Help: { glyph: "?", slug: "help" },
};

const CATEGORY_PIN_ICONS: Record<ServiceCategory, LucideIcon> = {
  Social: PartyPopper, Services: Wrench, Tutoring: GraduationCap, Jobs: Briefcase,
  Volunteer: HeartHandshake, Clubs: Gamepad2, Activities: Dumbbell, Events: Ticket,
  Businesses: Store, Help: HandHelping,
};

function CategoryPinIcon({ category }: { category: ServiceCategory }) {
  const Icon = CATEGORY_PIN_ICONS[category];
  return <Icon size={18} strokeWidth={1.8} aria-hidden="true" />;
}

function safeStyleUrl(candidate: string | undefined, fallback: string) {
  const value = candidate?.trim();
  if (!value) return fallback;
  if (value.startsWith("/") || /^https:\/\//i.test(value)) return value;
  return fallback;
}

export function resolveMapStyle(theme: "light" | "dark", light?: string, dark?: string) {
  return theme === "dark"
    ? safeStyleUrl(dark, DEFAULT_DARK_MAP_STYLE)
    : safeStyleUrl(light, DEFAULT_LIGHT_MAP_STYLE);
}

export function markerPresentation(service: Service, selected: boolean) {
  const marker = CATEGORY_MARKERS[service.category];
  return {
    glyph: marker.glyph,
    slug: marker.slug,
    label: `${service.title}. ${service.category}. Approximate service area, ${service.distanceMiles.toFixed(1)} miles away.`,
    zIndex: selected ? 60 : 10,
  };
}

function documentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function mapCenter(position: [number, number]): [number, number] {
  return [position[1], position[0]];
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fallbackPosition(position: [number, number], services: Service[]) {
  const latitudes = [CAMPUS_CENTER[0], ...services.map((service) => service.approximatePosition[0])];
  const longitudes = [CAMPUS_CENTER[1], ...services.map((service) => service.approximatePosition[1])];
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes) || 1;
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes) || 1;
  const x = 12 + ((position[1] - Math.min(...longitudes)) / longitudeSpan) * 76;
  const y = 88 - ((position[0] - Math.min(...latitudes)) / latitudeSpan) * 76;
  return { "--map-x": `${x}%`, "--map-y": `${y}%` } as CSSProperties;
}

function MapFallback({
  reason,
  online,
  services,
  selectedId,
  onSelect,
  onRetry,
}: {
  reason: MapFallbackReason;
  online: boolean;
  services: Service[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="campus-map-fallback" role="region" aria-label="Campus map fallback">
      <div className="campus-map-fallback-copy">
        <span className="map-state-kicker">CAMPUS DIRECTORY</span>
        <h2>{reason === "offline" ? "The map is offline." : "The live map could not load."}</h2>
        <p>
          Browse every approximate service zone below. Selecting a service still works, and no precise location is exposed.
        </p>
        <button className="secondary-button" type="button" disabled={!online} onClick={onRetry}>
          {online ? "Retry live map" : "Waiting for a connection"}
        </button>
      </div>

      <div className="campus-diagram" aria-hidden="true">
        <span className="campus-diagram-axis campus-diagram-axis-x" />
        <span className="campus-diagram-axis campus-diagram-axis-y" />
        <span className="campus-diagram-center">Campus</span>
        {services.map((service) => {
          const presentation = markerPresentation(service, service.id === selectedId);
          return (
            <span
              className={`campus-diagram-pin is-${presentation.slug}${service.id === selectedId ? " is-selected" : ""}`}
              key={service.id}
              style={{ ...fallbackPosition(service.approximatePosition, services), "--marker-color": categoryDefinition(service.category).accent } as CSSProperties}
            >
              <CategoryPinIcon category={service.category} />
            </span>
          );
        })}
      </div>

      <div className="campus-fallback-list" aria-label="Approximate service areas">
        {services.map((service) => {
          const selected = service.id === selectedId;
          const presentation = markerPresentation(service, selected);
          return (
            <button
              className={`campus-fallback-service is-${presentation.slug}${selected ? " is-selected" : ""}`}
              style={{ "--marker-color": categoryDefinition(service.category).accent } as CSSProperties}
              type="button"
              key={service.id}
              aria-pressed={selected}
              aria-label={presentation.label}
              onClick={() => onSelect(service.id)}
            >
              <span className="campus-fallback-glyph" aria-hidden="true"><CategoryPinIcon category={service.category} /></span>
              <span><strong>{service.title}</strong><small>{service.category} · {service.distanceMiles.toFixed(1)} mi</small></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function CampusMapClient({
  services,
  selectedId,
  recenterKey,
  onSelect,
  popupContent,
}: {
  services: Service[];
  selectedId?: string;
  recenterKey: number;
  onSelect: (id: string) => void;
  popupContent?: ReactNode;
}) {
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => { setPopupHost(document.createElement("div")); }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, MarkerRecord>());
  const onSelectRef = useRef(onSelect);
  const currentStyleRef = useRef("");
  const styleTimerRef = useRef<number | null>(null);
  const stylePendingRef = useRef(true);
  const phaseRef = useRef<MapPhase>("loading");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [phase, setPhase] = useState<MapPhase>(() => typeof navigator !== "undefined" && !navigator.onLine ? "fallback" : "loading");
  const [fallbackReason, setFallbackReason] = useState<MapFallbackReason>(() => typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "style");
  const [theme, setTheme] = useState<"light" | "dark">(() => typeof document === "undefined" ? "light" : documentTheme());
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || phase !== "ready") return;
    const canvas = map.getCanvas();
    map.dragPan.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disable();
    map.touchPitch.disable();
    const previousCursor = canvas.style.cursor;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    let drag: { id: number; button: number; x: number; y: number; bearing: number; pitch: number } | null = null;
    const down = (event: PointerEvent) => {
      if ((event.button !== 0 && event.button !== 2) || drag) return;
      event.preventDefault();
      map.stop();
      drag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, bearing: map.getBearing(), pitch: map.getPitch() };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      if (drag.button === 2) {
        map.panBy([drag.x - event.clientX, drag.y - event.clientY], { duration: 0 });
        drag.x = event.clientX;
        drag.y = event.clientY;
      } else {
        map.jumpTo({ bearing: drag.bearing + (event.clientX - drag.x) * 0.4, pitch: Math.max(0, Math.min(65, drag.pitch - (event.clientY - drag.y) * 0.3)) });
      }
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = "grab";
    };
    const preventMenu = (event: MouseEvent) => event.preventDefault();
    canvas.addEventListener("contextmenu", preventMenu);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
    return () => {
      canvas.removeEventListener("contextmenu", preventMenu);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      canvas.style.cursor = previousCursor;
      canvas.style.touchAction = previousTouchAction;
      map.dragPan.enable();
      map.dragRotate.enable();
      map.touchZoomRotate.enable();
      map.touchPitch.enable();
    };
  }, [phase, retryKey]);

  function setMapPhase(next: MapPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(documentTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerRef.current) containerRef.current.inert = phase !== "ready";
  }, [phase]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => {
      setOnline(false);
      stylePendingRef.current = false;
      setFallbackReason("offline");
      setMapPhase("fallback");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!navigator.onLine) return;

    const style = resolveMapStyle(
      documentTheme(),
      process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT_URL,
      process.env.NEXT_PUBLIC_MAP_STYLE_DARK_URL,
    );

    let map: MapLibreMap;
    try {
      // Turbopack cannot resolve MapLibre's package-relative worker URL reliably.
      // Keep the worker and its shared module same-origin under `public/` instead.
      setWorkerUrl(MAPLIBRE_WORKER_URL);
      map = new MapLibreMap({
        container,
        style,
        center: mapCenter(CAMPUS_CENTER),
        zoom: 14,
        minZoom: 11,
        maxZoom: 18,
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchZoomRotate: true,
        touchPitch: true,
        maxPitch: 65,
        fadeDuration: reducedMotion() ? 0 : 220,
      });
      // OpenFreeMap occasionally references optional POI decorations that are
      // absent from its sprite. Resolve only missing style images here; source,
      // tile, and style errors still flow through MapLibre's normal handlers.
      map.setMissingStyleImageResolver((id) => {
        if (!map.hasImage(id)) map.addImage(id, TRANSPARENT_STYLE_IMAGE);
      });
    } catch {
      window.queueMicrotask(() => {
        setFallbackReason("style");
        setMapPhase("fallback");
      });
      return;
    }

    mapRef.current = map;
    const markers = markersRef.current;
    currentStyleRef.current = style;
    stylePendingRef.current = true;
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
    map.addControl(new AttributionControl({
      compact: true,
      customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
    }), "bottom-left");

    const failStyle = () => {
      if (!stylePendingRef.current) return;
      stylePendingRef.current = false;
      if (styleTimerRef.current) window.clearTimeout(styleTimerRef.current);
      setFallbackReason("style");
      setMapPhase("fallback");
    };
    const handleMapReady = () => {
      stylePendingRef.current = false;
      if (styleTimerRef.current) window.clearTimeout(styleTimerRef.current);
      setMapPhase("ready");
    };
    const handleStyleReady = () => {
      // `style.load` also fires during initial startup, before the first
      // visually complete render. It is only a completion signal for later
      // theme swaps once the map has already reached the ready phase.
      if (phaseRef.current !== "ready") return;
      stylePendingRef.current = false;
      if (styleTimerRef.current) window.clearTimeout(styleTimerRef.current);
    };

    map.on("load", handleMapReady);
    map.on("style.load", handleStyleReady);
    styleTimerRef.current = window.setTimeout(() => {
      // A slow or partially failed tile must not replace an otherwise usable
      // map. MapLibre can report isolated source errors and may never become
      // fully `idle`, even after the style is ready.
      if (map.isStyleLoaded()) handleMapReady();
      else failStyle();
    }, 12_000);

    const refresh = () => map.resize();
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(container);
    const frame = window.requestAnimationFrame(refresh);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      if (styleTimerRef.current) window.clearTimeout(styleTimerRef.current);
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.off("load", handleMapReady);
      map.off("style.load", handleStyleReady);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigator.onLine) return;
    const nextStyle = resolveMapStyle(
      theme,
      process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT_URL,
      process.env.NEXT_PUBLIC_MAP_STYLE_DARK_URL,
    );
    if (nextStyle === currentStyleRef.current) return;

    currentStyleRef.current = nextStyle;
    stylePendingRef.current = true;
    if (styleTimerRef.current) window.clearTimeout(styleTimerRef.current);
    styleTimerRef.current = window.setTimeout(() => {
      if (stylePendingRef.current) {
        stylePendingRef.current = false;
        setFallbackReason("style");
        setMapPhase("fallback");
      }
    }, 12_000);
    try {
      map.setStyle(nextStyle);
    } catch {
      window.queueMicrotask(() => {
        stylePendingRef.current = false;
        setFallbackReason("style");
        setMapPhase("fallback");
      });
    }
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;

    markers.forEach(({ marker }) => marker.remove());
    markers.clear();

    services.forEach((service) => {
      const presentation = markerPresentation(service, false);
      const element = document.createElement("div");
      element.className = `campus-map-marker is-${presentation.slug}`;
      element.style.zIndex = String(presentation.zIndex);
      element.style.setProperty("--marker-color", categoryDefinition(service.category).accent);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "campus-map-pin";
      button.setAttribute("aria-label", presentation.label);
      button.setAttribute("aria-pressed", "false");
      button.title = `${service.title} — approximate service area`;

      const glyph = document.createElement("span");
      glyph.className = "campus-map-pin-glyph";
      glyph.setAttribute("aria-hidden", "true");
      // Only trusted, locally defined icon markup; no listing content is inserted as HTML.
      glyph.innerHTML = renderToStaticMarkup(<CategoryPinIcon category={service.category} />);

      const card = document.createElement("span");
      card.className = "campus-map-pin-card";
      const cardTitle = document.createElement("strong");
      cardTitle.textContent = service.title;
      const cardMeta = document.createElement("small");
      cardMeta.textContent = `${service.category} · ${service.distanceMiles.toFixed(1)} mi`;
      card.append(cardTitle, cardMeta);
      button.append(glyph, card);
      button.addEventListener("click", () => onSelectRef.current(service.id));
      element.append(button);

      const marker = new MapLibreMarker({ element, anchor: "bottom" })
        .setLngLat(mapCenter(service.approximatePosition))
        .addTo(map);
      markers.set(service.id, { marker, element, button });
    });

    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
    };
  }, [retryKey, services]);

  useEffect(() => {
    markersRef.current.forEach(({ element, button }, id) => {
      const selected = id === selectedId;
      element.classList.toggle("is-selected", selected);
      element.style.zIndex = String(selected ? 60 : 10);
      button.setAttribute("aria-pressed", String(selected));
    });

    const map = mapRef.current;
    if (!map || phaseRef.current === "fallback") return;
    const service = services.find((item) => item.id === selectedId);
    const target = mapCenter(service?.approximatePosition ?? CAMPUS_CENTER);
    const zoom = service ? 15 : 14;
    if (reducedMotion()) map.jumpTo({ center: target, zoom });
    else map.flyTo({ center: target, zoom, duration: 550, essential: false });
  }, [recenterKey, retryKey, selectedId, services]);

  function retryMap() {
    if (!navigator.onLine) return;
    setOnline(true);
    setMapPhase("loading");
    setRetryKey((value) => value + 1);
  }

  const popupVisible = Boolean(popupContent);
  useEffect(() => {
    const map = mapRef.current;
    const service = services.find((item) => item.id === selectedId);
    if (!map || !service || !popupHost || !popupVisible || phase !== "ready") return;
    const popup = new Popup({ closeButton: false, closeOnClick: false, anchor: "left", maxWidth: "340px", offset: 28, className: "listing-map-popup" })
      .setLngLat(mapCenter(service.approximatePosition))
      .setDOMContent(popupHost)
      .addTo(map);
    return () => { popup.remove(); };
  }, [selectedId, services, popupHost, popupVisible, phase]);

  return (
    <div className="campus-map-experience">
      {popupHost && popupVisible && phase === "ready" && createPortal(popupContent, popupHost)}
      {popupVisible && phase === "fallback" && <div className="fallback-listing-popup">{popupContent}</div>}
      <div
        ref={containerRef}
        className="maplibre-map"
        aria-label="Interactive map of approximate campus service areas"
        aria-hidden={phase !== "ready"}
      />

      {phase === "loading" && (
        <div className="map-loading map-boot-state" role="status" aria-live="polite">
          <span className="map-loading-mark" aria-hidden="true" />
          <strong>Opening the campus map</strong>
          <span>Loading privacy-safe service zones…</span>
        </div>
      )}

      {phase === "ready" && (
        <div className="map-camera-controls" role="group" aria-label="Map camera">
          <button type="button" aria-label="Tilt map" title="Toggle tilted view" onClick={() => { const map = mapRef.current; if (map) map.easeTo({ pitch: map.getPitch() > 0 ? 0 : 50, duration: reducedMotion() ? 0 : 350 }); }}>3D</button>
          <button type="button" aria-label="Reset map orientation" title="Reset north and flatten" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: reducedMotion() ? 0 : 300 })}>N ↑</button>
        </div>
      )}
      {phase === "ready" && (
        <div className="map-provider-state" role="status" aria-live="polite">
          <span /> Vector map ready
        </div>
      )}

      {phase === "fallback" && (
        <MapFallback
          reason={fallbackReason}
          online={online}
          services={services}
          selectedId={selectedId}
          onSelect={onSelect}
          onRetry={retryMap}
        />
      )}
    </div>
  );
}
