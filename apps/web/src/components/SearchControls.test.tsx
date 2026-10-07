import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "../state/search";
import { theme } from "../theme";
import { SearchControls, activeFilterCount } from "./SearchControls";

const setup = () => {
  const props = { state: initialState, onRadius: vi.fn(), onFilters: vi.fn(), onSearch: vi.fn(), onLocation: vi.fn() };
  render(<SearchControls {...props} />);
  return props;
};

describe("SearchControls", () => {
  it("labels each control in sentence case with its value on the label row", () => {
    setup();
    expect(screen.getByRole("slider", { name: "Radius" })).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByText("5 mi")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Min roof age" })).toHaveAttribute("aria-valuenow", "15");
    expect(screen.getByText("15 yrs")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Min open years" })).toBeInTheDocument();
    expect(screen.getByText("Pin: 37.3382, -121.8863")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy coordinates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("permit state is a radio group with Open, Stalled and Any", () => {
    const props = setup();
    const group = screen.getByRole("radiogroup", { name: "Permit state" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Stalled" }));
    expect(props.onFilters).toHaveBeenCalledWith({ permitState: "expired_unfinaled" });
    fireEvent.click(screen.getByRole("radio", { name: "Open" }));
    expect(props.onFilters).toHaveBeenCalledWith({ permitState: "open" });
  });

  it("roofing switch and Refresh", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Roofing permits only" }));
    expect(props.onFilters).toHaveBeenCalledWith({ roofingOnly: false });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(props.onSearch).toHaveBeenCalled();
  });

  it("the theme turns off uppercase buttons", () => {
    expect(theme.components?.MuiButton?.styleOverrides?.root).toMatchObject({ textTransform: "none" });
  });

  it("lays out as one bar and counts active filters", () => {
    const props = { state: initialState, onRadius: vi.fn(), onFilters: vi.fn(), onSearch: vi.fn(), onLocation: vi.fn() };
    render(<SearchControls {...props} layout="bar" />);
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(activeFilterCount(initialState, initialState)).toBe(0);
    const changed = { ...initialState, radiusMiles: 2, filters: { ...initialState.filters, permitState: "open" as const, minOpenYears: 3 } };
    expect(activeFilterCount(changed, initialState)).toBe(3);
  });
});
