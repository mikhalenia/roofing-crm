import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import { ResultsTable } from "./ResultsTable";
import type { ResultRow } from "../state/search";

const provenance = { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" };
function row(apn: string, extra: Record<string, unknown>): ResultRow {
  return {
    lead: {
      apn,
      lat: 37.3,
      lon: -121.9,
      bbbRating: null,
      distanceMiles: 1.234,
      provenance,
      ...extra,
    } as PipelineLead,
    signals: new Set(["open_permit"]),
  };
}
const rows = [
  row("A", { situsAddress: "1 Short St", daysOpen: 100, roofAgeYears: 22, roofAgeAnchor: "final_date" }),
  row("B", { situsAddress: "2 Long St", daysOpen: 900, permitState: "open" }),
];

describe("ResultsTable", () => {
  it("renders rows sorted by days open desc by default", () => {
    render(<ResultsTable rows={rows} onSelect={() => undefined} />);
    const body = screen.getAllByRole("button", { name: /^Open details/ });
    expect(body).toHaveLength(2);
    expect(within(body[0] as HTMLElement).getByText("2 Long St")).toBeInTheDocument();
    expect(within(body[1] as HTMLElement).getByText("1 Short St")).toBeInTheDocument();
  });

  it("shows roof age chip and BBB not available", () => {
    render(<ResultsTable rows={rows} onSelect={() => undefined} />);
    expect(screen.getByText("22 yrs")).toBeInTheDocument();
    expect(screen.getAllByText("not available")).toHaveLength(2);
  });

  it("toggles sort when clicking a header and selects on row click", () => {
    const onSelect = vi.fn();
    render(<ResultsTable rows={rows} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Days open"));
    const body = screen.getAllByRole("button", { name: /^Open details/ });
    expect(within(body[0] as HTMLElement).getByText("1 Short St")).toBeInTheDocument();
    fireEvent.click(body[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("A");
  });

  it("opens a row with Enter and Space", () => {
    const onSelect = vi.fn();
    render(<ResultsTable rows={rows} onSelect={onSelect} />);
    const first = screen.getAllByRole("button", { name: /^Open details/ })[0] as HTMLElement;
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("aria-label", "Open details for 2 Long St");
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.keyDown(first, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith("B");
  });
});
