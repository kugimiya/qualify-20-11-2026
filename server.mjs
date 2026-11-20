import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

export const MODEL_TIMEOUT_MS = 300;
export const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);
export const MANUAL_REVIEW = { status: "manual_review", topic: null, draft: null };

const html = await readFile(new URL("./index.html", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

/** @returns {{ ok: true, text: string } | { ok: false }} */
export function parseRequestText(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  if (typeof body.text !== "string" || body.text.trim() === "") {
    return { ok: false };
  }
  return { ok: true, text: body.text };
}

/** @returns {{ topic: string, draft: string } | null } */
export function parseModelPayload(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  if (!ALLOWED_TOPICS.has(data.topic)) {
    return null;
  }
  if (typeof data.draft !== "string" || data.draft.trim() === "") {
    return null;
  }
  return { topic: data.topic, draft: data.draft };
}

async function callModel(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const raw = await classify(text, { signal: controller.signal });
    return parseModelPayload(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const parsed = parseRequestText(Buffer.concat(chunks).toString("utf8"));
  if (!parsed.ok) {
    return json(response, 400, { status: "invalid_input" });
  }

  const result = await callModel(parsed.text);
  if (!result) {
    return json(response, 200, MANUAL_REVIEW);
  }
  return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft });
}

export function createApp() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      json(response, 500, { status: "server_error" });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  createApp().listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
