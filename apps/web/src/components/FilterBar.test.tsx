import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../state/search";
import { FilterBar } from "./FilterBar";

const props = () => ({ onRadius: vi.fn(), onFilters: vi.fn(), onSearch: vi.fn(), onLocation: vi.fn() });

const mockMedia = (matches: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("FilterBar", () => {
  it("is one bar of filters above the map on wide screens", () => {
    mockMedia(false);
    render(<FilterBar state={initialState} {...props()} />);
    const bar = screen.getByRole("region", { name: "Search filters" });
    expect(bar).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Radius" })).toBeInTheDocument();
  });

  it("collapses into a Filters button with a bottom sheet on phones", () => {
    mockMedia(true);
    const state = { ...initialState, filters: { ...initialState.filters, permitState: "open" as const } };
    render(<FilterBar state={state} {...props()} />);
    expect(screen.queryByRole("slider", { name: "Radius" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filters (1 active)" }));
    expect(screen.getByRole("dialog", { name: "Search filters" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Radius" })).toBeInTheDocument();
  });
});
