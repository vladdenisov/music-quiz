import { describe, expect, it } from "vitest";
import { getGenerationOptions } from "../domain/generation-options.js";

describe("generation options catalog", () => {
  it("exposes broad frontend-selectable generation parameters", () => {
    const options = getGenerationOptions();

    expect(options.languages.map((item) => item.id)).toEqual(expect.arrayContaining(["english", "russian", "mixed"]));
    expect(options.decades.map((item) => item.id)).toEqual(expect.arrayContaining(["1970s", "1980s", "1990s", "2000s"]));
    expect(options.genres.map((item) => item.id)).toEqual(expect.arrayContaining(["pop", "rock", "hip_hop", "rus_pop", "rus_rock", "rus_rap"]));
    expect(options.moods.length).toBeGreaterThanOrEqual(10);
    expect(options.presets.length).toBeGreaterThanOrEqual(10);
  });
});
