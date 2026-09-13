// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVICES } from "@/lib/service-catalog";
import { SERVICE_CATEGORIES } from "@/lib/service-taxonomy";

const mapState = vi.hoisted(() => ({
  instances: [] as Array<Record<string, unknown>>,
  workerUrls: [] as string[],
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    options: Record<string, unknown>;
    handlers = new globalThis.Map<string, Set<(event?: unknown) => void>>();
    setStyle = vi.fn();
    flyTo = vi.fn();
    jumpTo = vi.fn();
    easeTo = vi.fn();
    panBy = vi.fn();
    stop = vi.fn();
    resize = vi.fn();
    remove = vi.fn();
    getBearing = vi.fn(() => 0);
    getPitch = vi.fn(() => 0);
    canvas = document.createElement("canvas");
    getCanvas = () => this.canvas;
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    dragRotate = { enable: vi.fn(), disable: vi.fn() };
    touchZoomRotate = { enable: vi.fn(), disable: vi.fn() };
    touchPitch = { enable: vi.fn(), disable: vi.fn() };
    isStyleLoaded = vi.fn(() => false);
    hasImage = vi.fn(() => false);
    addImage = vi.fn();
    missingStyleImageResolver?: (id: string) => void | Promise<void>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mapState.instances.push(this as unknown as Record<string, unknown>);
    }

    addControl() { return this; }
    setMissingStyleImageResolver(resolver: (id: string) => void | Promise<void>) {
      this.missingStyleImageResolver = resolver;
      return this;
    }
    on(name: string, handler: (event?: unknown) => void) {
      const handlers = this.handlers.get(name) ?? new Set();
      handlers.add(handler);
      this.handlers.set(name, handlers);
      return this;
    }
    off(name: string, handler: (event?: unknown) => void) {
      this.handlers.get(name)?.delete(handler);
      return this;
    }
    emit(name: string, event?: unknown) {
      this.handlers.get(name)?.forEach((handler) => handler(event));
    }
  }

  class FakeMarker {
    element: HTMLElement;
    constructor(options: { element: HTMLElement }) { this.element = options.element; }
    setLngLat() { return this; }
    addTo(map: FakeMap) {
      (map.options.container as HTMLElement).append(this.element);
      return this;
    }
    remove() { this.element.remove(); return this; }
  }

  class FakePopup {
    content: HTMLElement | null = null;
    setLngLat() { return this; }
    setDOMContent(content: HTMLElement) { this.content = content; return this; }
    addTo(map: FakeMap) {
      if (this.content) (map.options.container as HTMLElement).append(this.content);
      return this;
    }
    remove() { this.content?.remove(); return this; }
  }

  return {
    AttributionControl: class {},
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    NavigationControl: class {},
    setWorkerUrl: (value: string) => mapState.workerUrls.push(value),
  };
});

import CampusMapClient, {
  DEFAULT_DARK_MAP_STYLE,
  DEFAULT_LIGHT_MAP_STYLE,
  MAPLIBRE_WORKER_URL,
  markerPresentation,
  resolveMapStyle,
} from "./campus-map-client";

type FakeMapInstance = {
  options: Record<string, unknown>;
  emit: (name: string, event?: unknown) => void;
  setStyle: ReturnType<typeof vi.fn>;
  addImage: ReturnType<typeof vi.fn>;
  missingStyleImageResolver?: (id: string) => void | Promise<void>;
};

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

beforeEach(() => {
  mapState.instances.length = 0;
  mapState.workerUrls.length = 0;
  setOnline(true);
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("campus map style contract", () => {
  it("uses the same-origin MapLibre worker instead of Turbopack's package URL", () => {
    render(<CampusMapClient services={SERVICES.slice(0, 1)} recenterKey={0} onSelect={() => undefined} />);
    expect(mapState.workerUrls).toEqual([MAPLIBRE_WORKER_URL]);
  });

  it("resolves missing optional POI sprites without changing service markers", async () => {
    render(<CampusMapClient services={SERVICES.slice(0, 1)} recenterKey={0} onSelect={() => undefined} />);
    const map = mapState.instances[0] as unknown as FakeMapInstance;

    await map.missingStyleImageResolver?.("office");
    expect(map.addImage).toHaveBeenCalledWith("office", {
      width: 1,
      height: 1,
      data: new Uint8Array([0, 0, 0, 0]),
    });
  });

  it("selects key-free light and dark defaults and rejects unsafe overrides", () => {
    expect(resolveMapStyle("light")).toBe(DEFAULT_LIGHT_MAP_STYLE);
    expect(resolveMapStyle("dark")).toBe(DEFAULT_DARK_MAP_STYLE);
    expect(resolveMapStyle("light", "https://maps.example/style.json")).toBe("https://maps.example/style.json");
    expect(resolveMapStyle("dark", undefined, "/maps/dark.json")).toBe("/maps/dark.json");
    expect(resolveMapStyle("light", "javascript:alert(1)")).toBe(DEFAULT_LIGHT_MAP_STYLE);
  });

  it("switches the live style when the document theme changes", async () => {
    render(<CampusMapClient services={SERVICES.slice(0, 1)} recenterKey={0} onSelect={() => undefined} />);
    const map = mapState.instances[0] as unknown as FakeMapInstance;
    expect(map.options.style).toBe(DEFAULT_LIGHT_MAP_STYLE);
    act(() => map.emit("load"));
    expect(screen.getByText("Vector map ready")).toBeInTheDocument();

    document.documentElement.dataset.theme = "dark";
    await waitFor(() => expect(map.setStyle).toHaveBeenCalledWith(DEFAULT_DARK_MAP_STYLE));
    act(() => map.emit("style.load"));
    expect(screen.getByText("Vector map ready")).toBeInTheDocument();
  });
});

describe("campus map interaction and fallback", () => {
  it("gives categories distinct, privacy-specific marker semantics", () => {
    const presentations = SERVICES.map((service) => markerPresentation(service, false));
    expect(new Set(presentations.map((item) => item.slug)).size).toBe(SERVICE_CATEGORIES.length);
    expect(presentations[0].label).toContain("Approximate service area");
    expect(markerPresentation(SERVICES[0], true).zIndex).toBeGreaterThan(presentations[0].zIndex);
  });

  it("keeps markers keyboard-clickable and updates selected state without recreating the map", () => {
    const onSelect = vi.fn();
    const services = SERVICES.filter((service) => ["math-midterms", "usb-c-charger"].includes(service.id));
    const { rerender } = render(<CampusMapClient services={services} recenterKey={0} onSelect={onSelect} />);
    const map = mapState.instances[0] as unknown as FakeMapInstance;
    act(() => map.emit("load"));

    const marker = screen.getByRole("button", { name: /I need help with calculus.*Approximate service area/ });
    expect(marker).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(marker);
    expect(onSelect).toHaveBeenCalledWith("math-midterms");

    rerender(<CampusMapClient services={services} selectedId="math-midterms" recenterKey={1} onSelect={onSelect} />);
    expect(marker).toHaveAttribute("aria-pressed", "true");
    expect(mapState.instances).toHaveLength(1);
  });

  it("keeps a transient source error from replacing the entire map", () => {
    render(<CampusMapClient services={SERVICES.slice(0, 2)} recenterKey={0} onSelect={() => undefined} />);
    const map = mapState.instances[0] as unknown as FakeMapInstance;

    act(() => map.emit("error", new Error("one tile failed")));
    expect(screen.getByText("Opening the campus map")).toBeInTheDocument();

    act(() => map.emit("load"));
    expect(screen.getByText("Vector map ready")).toBeInTheDocument();
  });

  it("replaces a map that never loads with a usable service directory", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const services = SERVICES.filter((service) => ["math-midterms", "usb-c-charger"].includes(service.id));
    render(<CampusMapClient services={services} recenterKey={0} onSelect={onSelect} />);
    act(() => vi.advanceTimersByTime(12_000));

    expect(screen.getByRole("heading", { name: "The live map could not load." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /USB-C charger.*Approximate service area/ }));
    expect(onSelect).toHaveBeenCalledWith("usb-c-charger");
    vi.useRealTimers();
  });

  it("starts in an honest offline directory and disables map retry", () => {
    setOnline(false);
    render(<CampusMapClient services={SERVICES.slice(0, 1)} recenterKey={0} onSelect={() => undefined} />);
    expect(screen.getByRole("heading", { name: "The map is offline." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting for a connection" })).toBeDisabled();
    expect(mapState.instances).toHaveLength(0);
  });
});
