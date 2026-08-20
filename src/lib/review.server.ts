import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { staticScan } from "./py-static";

const MODEL = "google/gemini-2.5-flash";

const IssueSchema = z.object({
  line: z.number().describe("1-based line number, or 0 if not line specific"),
  severity: z.string().describe("one of: error, warning, style"),
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});

const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(IssueSchema),
  correctedCode: z.string(),
});

const RefineSchema = ReviewSchema.extend({
  refinementNotes: z.string().describe("What the second pass changed or confirmed"),
});

export type ReviewResult = z.infer<typeof RefineSchema> & { staticFindings: string[] };

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
    output: Output.object({ schema: ReviewSchema }),
    system:
      "You are a precise Python code reviewer. Reason like a static analyzer over the AST: check syntax, names, scope, types, control flow, exceptions, mutable defaults, resource handling, and PEP 8. Severity must be exactly 'error', 'warning' or 'style'. correctedCode must be complete, runnable Python with no line numbers.",
    prompt: `Review this Python code.\n\nStructural pre-pass findings:\n${findingText}\n\nCode (line-numbered):\n${numbered}`,
  });

  const draft = first.output;

  const second = await generateText({
    model: gateway(MODEL),
    output: Output.object({ schema: RefineSchema }),
    system:
      "You are the same reviewer performing a self-reflection pass. Critique your own draft review: drop false positives, merge duplicates, add missed real bugs, make each suggestion concrete and actionable, and verify the corrected code is syntactically valid Python that preserves the original intent. Severity must be exactly 'error', 'warning' or 'style'. correctedCode must be complete Python with no line numbers.",
    prompt: `Original code:\n${code}\n\nDraft review (JSON):\n${JSON.stringify(draft)}\n\nReturn the improved final review.`,
  });

  return {
    ...second.output,
    staticFindings: findings.map((f) => `line ${f.line}: ${f.message}`),
  };
}
