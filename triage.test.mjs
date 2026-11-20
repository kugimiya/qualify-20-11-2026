import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, parseModelPayload, parseRequestText } from "./server.mjs";

test("parseRequestText rejects empty and non-string input", () => {
  assert.equal(parseRequestText("{").ok, false);
  assert.equal(parseRequestText(JSON.stringify({ text: "" })).ok, false);
  assert.equal(parseRequestText(JSON.stringify({ text: "   " })).ok, false);
  assert.equal(parseRequestText(JSON.stringify({ text: 1 })).ok, false);
  assert.equal(parseRequestText(JSON.stringify({ text: "заказ" })).ok, true);
});

test("parseModelPayload rejects bad topic and whitespace-only draft", () => {
  assert.equal(parseModelPayload("not-json"), null);
  assert.equal(parseModelPayload(JSON.stringify({ topic: "refund", draft: "ok" })), null);
  assert.equal(parseModelPayload(JSON.stringify({ topic: "other", draft: "  " })), null);
  assert.deepEqual(
    parseModelPayload(JSON.stringify({ topic: "delivery", draft: "Спасибо" })),
    { topic: "delivery", draft: "Спасибо" },
  );
});

test("POST /api/triage returns manual_review when model draft is empty", async () => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const reply = await fetch(`http://127.0.0.1:${port}/api/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Нужна помощь [empty-draft]" }),
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), {
      status: "manual_review",
      topic: null,
      draft: null,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
