import { describe, it, expect } from "vitest";

describe("Groq API Key Validation", () => {
  it("should have GROQ_API_KEY set", () => {
    const key = process.env.GROQ_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key!.startsWith("gsk_")).toBe(true);
  });

  it("should successfully call Groq API", async () => {
    const key = process.env.GROQ_API_KEY;
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);
  });
});
