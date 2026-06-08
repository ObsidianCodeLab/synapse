import { readFileSync } from "node:fs";

const THINKING_BLOCK_RES = [
  /<thinking>[\s\S]*?<\/thinking>\s*/gi,
  /<think>[\s\S]*?<\/redacted_thinking>\s*/gi,
  /<think>[\s\S]*?<\/think>\s*/gi,
  /<thinking>[\s\S]*?<\/think>\s*/gi,
  /<think>[\s\S]*?<\/thinking>\s*/gi,
];

function stripThinkingTags(text) {
  let cleaned = text;
  for (const re of THINKING_BLOCK_RES) cleaned = cleaned.replace(re, "");
  cleaned = cleaned.replace(
    /<(?:redacted_)?thinking>[\s\S]*?<\/(?:redacted_)?think(?:ing)?>\s*/gi,
    "",
  );
  return cleaned.trim();
}

const j = JSON.parse(
  readFileSync(
    new URL("../../data/llm_debug/llm_response_20260526_163106_5df3ae40.json", import.meta.url),
    "utf8",
  ),
);
const t = j.llm_response.content[0].text;
const out = stripThinkingTags(t);
console.log("in", t.length, "out", out.length);
console.log("still has think tag?", /<(?:redacted_)?think/i.test(out));
console.log(out.slice(0, 80));
