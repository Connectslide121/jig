import { describe, expect, it } from "vitest";
import * as app from "../../apps/desktop/src/shared/openaiPrices";
import { CHATGPT_COST_NOTE, CHATGPT_NO_PRICE_NOTE } from "./costNotes";

describe("cost notes", () => {
  it("say the same as the app's", () => {
    expect(CHATGPT_COST_NOTE).toBe(app.CHATGPT_COST_NOTE);
    expect(CHATGPT_NO_PRICE_NOTE).toBe(app.CHATGPT_NO_PRICE_NOTE);
  });
});
