/**
 * The tooltips for a ChatGPT cost (D-414), for the add-ons that show one (the Tasks queue). The app
 * has the same strings in apps/desktop/src/shared/openaiPrices.ts: add-ons can't import from the app,
 * whose source doesn't ship with Jig (D-415). costNotes.test.ts keeps both the same.
 */

export const CHATGPT_COST_NOTE = "Estimated at OpenAI API prices; your ChatGPT plan isn't billed per token.";
export const CHATGPT_NO_PRICE_NOTE = "No cost: OpenAI publishes no API price Jig knows for this model.";
