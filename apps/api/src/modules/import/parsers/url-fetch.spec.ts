import { afterEach, describe, expect, it, vi } from "vitest";
import { extractMainText, fetchUrlText } from "./url-fetch";

describe("extractMainText", () => {
  it("strips scripts and extracts readable text from HTML", () => {
    const html = `
      <html>
        <head><title>Novel</title><script>alert('x')</script></head>
        <body>
          <nav>Menu</nav>
          <article>
            <h1>Chương 1</h1>
            <p>Once upon a time.</p>
          </article>
          <script>void 0</script>
        </body>
      </html>
    `;
    const text = extractMainText(html);
    expect(text).toContain("Chương 1");
    expect(text).toContain("Once upon a time");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("void 0");
  });
});

describe("fetchUrlText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads HTML and extracts main text", async () => {
    const html = `
      <html><body>
        <h1>Chapter 1</h1>
        <p>Fetched body text.</p>
        <script>evil()</script>
      </body></html>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => html,
        headers: { get: () => "text/html; charset=utf-8" },
      }),
    );

    const result = await fetchUrlText("https://example.com/novel");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/novel",
      expect.any(Object),
    );
    expect(result.text).toContain("Fetched body text");
    expect(result.text).not.toContain("evil");
    expect(result.rawHtml).toContain("<html>");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "missing",
        headers: { get: () => "text/html" },
      }),
    );

    await expect(fetchUrlText("https://example.com/missing")).rejects.toThrow(
      /404/,
    );
  });
});
