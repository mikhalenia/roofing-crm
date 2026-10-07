import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

import App from "./app";

describe("App", () => {
  it("renders the app title", () => {
    const { getByRole } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(getByRole("heading").textContent).toBe("Roofing CRM");
  });
});
