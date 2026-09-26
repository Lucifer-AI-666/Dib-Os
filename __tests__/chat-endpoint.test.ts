import { describe, it, expect } from "vitest";

const API_BASE = "http://127.0.0.1:3000/api/trpc";

describe("Chat AI Endpoint", () => {
  it("should respond with AI content from Matildina identity", async () => {
    const response = await fetch(`${API_BASE}/chat.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          message: "Chi sei?",
          identity: "matildina",
          history: [],
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.data.json.content).toBeDefined();
    expect(data.result.data.json.content.length).toBeGreaterThan(10);
    expect(data.result.data.json.identity).toBe("matildina");
  });

  it("should respond with AI content from Dio identity", async () => {
    const response = await fetch(`${API_BASE}/chat.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          message: "Salve",
          identity: "dio",
          history: [],
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.data.json.content).toBeDefined();
    expect(data.result.data.json.content.length).toBeGreaterThan(10);
    expect(data.result.data.json.identity).toBe("dio");
  });

  it("should handle conversation history", async () => {
    const response = await fetch(`${API_BASE}/chat.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          message: "Ripeti il mio nome",
          identity: "michele",
          history: [
            { role: "user", content: "Mi chiamo Marco" },
            { role: "assistant", content: "Piacere Marco, sono Michele." },
          ],
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.data.json.content).toBeDefined();
    expect(data.result.data.json.identity).toBe("michele");
  });
});
