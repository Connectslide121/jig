import { describe, expect, it } from "vitest";
import { makePdf } from "../../../../../e2e/makePdf";
import { pdfText } from "./pdf";

describe("pdfText", () => {
  it("reads each page's text", async () => {
    expect(await pdfText(makePdf(["Prices include VAT."]))).toBe("Prices include VAT.");
    const two = await pdfText(makePdf(["First page", "Second page"]));
    expect(two).toBe("--- Page 1 ---\nFirst page\n\n--- Page 2 ---\nSecond page");
  });
  it("says why a PDF can't be read", async () => {
    await expect(pdfText(new TextEncoder().encode("not a pdf"), "x.pdf")).rejects.toThrow("couldn't be read");
    await expect(pdfText(makePdf([""]), "scan.pdf")).rejects.toThrow("no text to read");
  });
});
