import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { staticScan } from "./py-static";

const MODEL = "google/gemini-2.5-flash";

export type ReviewIssue = {
  line: number;
  severity: "error" | "warning" | "style";
  title: string;
  explanation: string;
  suggestion: string;
};

export type ReviewResult = {
  summary: string;
  issues: ReviewIssue[];
  correctedCode: string;
  refinementNotes: string;
  staticFindings: string[];
};

const SHAPE = `Respond with ONLY a single JSON object (no markdown fences), shaped exactly:
{
  "summary": string,
  "issues": [{ "line": number, "severity": "error" | "warning" | "style", "title": string, "explanation": string, "suggestion": string }],
  "correctedCode": string,
  "refinementNotes": string
}
"correctedCode" is complete runnable Python with no line numbers. Never return a top-level array.`;

function parseJson(text: string): Record<string, unknown> {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as Record<string, unknown>;
}

function normalize(raw: Record<string, unknown>, fallbackCode: string): Omit<ReviewResult, "staticFindings"> {
  const rawIssues = Array.isArray(raw["issues"]) ? (raw["issues"] as Record<string, unknown>[]) : [];
  const issues: ReviewIssue[] = rawIssues.map((i) => {
    const sev = String(i["severity"] ?? "warning").toLowerCase();
    return {
      line: Number(i["line"] ?? 0) || 0,
      severity: sev === "error" || sev === "style" ? sev : "warning",
      title: String(i["title"] ?? "Issue"),
      explanation: String(i["explanation"] ?? ""),
      suggestion: String(i["suggestion"] ?? ""),
    };
  });
  return {
    summary: String(raw["summary"] ?? ""),
    issues,
    correctedCode: String(raw["correctedCode"] ?? fallbackCode),
    refinementNotes: String(raw["refinementNotes"] ?? ""),
  };
}

export async function runReview(code: string): Promise<ReviewResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);

  const findings = staticScan(code);
  const findingText = findings.length
    ? findings.map((f) => `line ${f.line}: ${f.message}`).join("\n")
    : "none detected";
  const numbered = code
    .split("\n")
    .map((l, i) => `${i + 1}: ${l}`)
    .join("\n");

  const first = await generateText({
    model: gateway(MODEL),
    system: `You are a precise Python code reviewer. Reason over the code's syntax tree: syntax errors, undefined names, scope, types, control flow, exceptions, mutable default arguments, resource handling, and PEP 8 style. ${SHAPE}`,
    prompt: `Review this Python code.\n\nStructural pre-pass findings:\n${findingText}\n\nCode (line-numbered):\n${numbered}`,
  });

  const draft = parseJson(first.text);

  const second = await generateText({
    model: gateway(MODEL),
    system: `You are the same reviewer running a self-reflection pass. Critique your own draft: remove false positives, merge duplicates, add missed real bugs, make every suggestion concrete, and verify the corrected code is valid Python preserving the original intent. Put what your reflection changed in "refinementNotes". ${SHAPE}`,
    prompt: `Original code:\n${code}\n\nDraft review JSON:\n${JSON.stringify(draft)}\n\nReturn the improved final review.`,
  });

  let final: Omit<ReviewResult, "staticFindings">;
  try {
    final = normalize(parseJson(second.text), code);
  } catch {
    final = normalize(draft, code);
  }

  return { ...final, staticFindings: findings.map((f) => `line ${f.line}: ${f.message}`) };
}
