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

  it("labels stalled permits and shows the CSLB license number with status as secondary text", () => {
    render(
      <ResultsTable
        rows={[
          row("S", { situsAddress: "3 Stall St", permitState: "expired_unfinaled", cslbLicenseNumber: "765432", cslbStatus: "Active" }),
          row("N", { situsAddress: "4 None St", permitState: "open" }),
        ]}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("Stalled (expired, no final inspection)")).toBeInTheDocument();
    expect(screen.queryByText("expired_unfinaled")).toBeNull();
    expect(screen.getByText("765432")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("states the count, and that it is a lower bound when capped", () => {
    const { rerender } = render(<ResultsTable rows={rows} onSelect={() => undefined} />);
    expect(screen.getByText("2 results")).toBeInTheDocument();
    rerender(<ResultsTable rows={rows} capped onSelect={() => undefined} />);
    expect(screen.getByText(/Showing 2 of at least 2/)).toBeInTheDocument();
  });

  it("reports row hover and highlights the hovered row", () => {
    const onHover = vi.fn();
    render(<ResultsTable rows={rows} onSelect={() => undefined} hoverApn="A" onHover={onHover} />);
    const a = screen.getByRole("button", { name: "Open details for 1 Short St" });
    expect(a).toHaveAttribute("data-hovered", "true");
    expect(screen.getByRole("button", { name: "Open details for 2 Long St" })).not.toHaveAttribute("data-hovered");
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Open details for 2 Long St" }));
    expect(onHover).toHaveBeenLastCalledWith("B");
    fireEvent.mouseLeave(a);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});
