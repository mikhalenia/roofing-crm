import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataStatus } from "./DataStatus";

const snapshot = { runId: "2026-10-07T17-10-54Z", manifestCid: "bafyMANIFEST", syncedAt: null };

describe("DataStatus", () => {
  it("shows a friendly date from the run id", () => {
    render(<DataStatus snapshot={snapshot} error={null} />);
    expect(screen.getByRole("button", { name: "Data: Santa Clara County · updated Oct 7, 2026" })).toBeInTheDocument();
  });

  it("opens About this data with the CID behind Technical details", async () => {
    render(<DataStatus snapshot={{ ...snapshot, syncedAt: "2026-10-08T01:00:00Z" }} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: /updated Oct 8, 2026/ }));
    const dialog = await screen.findByRole("dialog", { name: "About this data" });
    expect(dialog).toHaveTextContent("County of Santa Clara parcels and City of San José building permits");
    expect(screen.queryByText(/Manifest CID bafyMANIFEST/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(screen.getByText(/Manifest CID bafyMANIFEST/)).toBeInTheDocument();
    expect(screen.getByText(/A CID is a fingerprint of the published data/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on a public gateway" })).toHaveAttribute("href", "https://ipfs.io/ipfs/bafyMANIFEST");
    expect(screen.getByText("Run id: 2026-10-07T17-10-54Z")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy CID" })).toBeInTheDocument();
  });

  it("shows the error state", async () => {
    render(<DataStatus snapshot={null} error="Pipeline API error 500" />);
    fireEvent.click(screen.getByRole("button", { name: "Data unavailable" }));
    expect(await screen.findByText(/unreachable right now: Pipeline API error 500/)).toBeInTheDocument();
  });
});
