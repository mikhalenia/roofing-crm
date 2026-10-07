import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FutureNav } from "./FutureNav";

describe("FutureNav", () => {
  it("renders the five future items as aria-disabled", () => {
    render(<FutureNav />);
    for (const label of ["Campaigns", "Outreach", "Estimates & Quotes", "Crew Scheduling", "Reporting"]) {
      expect(screen.getByText(label).closest("[aria-disabled='true']")).not.toBeNull();
    }
  });
});
