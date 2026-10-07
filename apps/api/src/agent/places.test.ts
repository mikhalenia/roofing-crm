import { describe, expect, it } from "vitest";
import { geocodePlace, PLACES } from "./places";

describe("geocodePlace", () => {
  it("covers the 15 county cities", () => {
    expect(Object.keys(PLACES)).toHaveLength(15);
  });

  it("resolves 'near Cupertino, CA' to Cupertino", () => {
    expect(geocodePlace("near Cupertino, CA")).toEqual({
      place: "Cupertino",
      lat: 37.323,
      lon: -122.0322,
    });
  });

  it.each(["San Jose", "san josé", "downtown San Jose", "San José, California", "SAN JOSE CA"])(
    "resolves %s to San José",
    (q) => {
      expect(geocodePlace(q)).toEqual({ place: "San José", lat: 37.3382, lon: -121.8863 });
    },
  );

  it("does not confuse Los Altos Hills with Los Altos", () => {
    expect(geocodePlace("Los Altos Hills")?.place).toBe("Los Altos Hills");
    expect(geocodePlace("los altos")?.place).toBe("Los Altos");
  });

  it("returns null for unknown places", () => {
    expect(geocodePlace("Fresno")).toBeNull();
    expect(geocodePlace("")).toBeNull();
  });
});
