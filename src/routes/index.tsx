import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { reviewPython } from "@/lib/review.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PyReflect — Self-Reflecting Python Code Review Agent" },
      {
        name: "description",
        content:
          "Paste Python code and get a two-pass AI review: structural errors, actionable suggestions, and fully corrected code.",
      },
      { property: "og:title", content: "PyReflect — Self-Reflecting Python Code Review Agent" },
      {
        property: "og:description",
        content:
          "A reflective AI agent that finds Python errors, refines its own critique, and returns corrected code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SAMPLE = `def get_average(numbers=[]):
    total = 0
    for n in numbers:
        total += n
    return total / len(numbers)

def load(path)
    f = open(path)
    data = f.read()
    print "loaded", path
    return data
`;

const severityStyles: Record<string, string> = {
  error: "border-destructive/50 bg-destructive/10 text-destructive",
  warning: "border-warning/50 bg-warning/10 text-warning",
  style: "border-style-hint/50 bg-style-hint/10 text-style-hint",
};

function Index() {
  const [code, setCode] = useState(SAMPLE);
  const review = useServerFn(reviewPython);
  const mutation = useMutation({
    mutationFn: (source: string) => review({ data: { code: source } }),
  });
  const result = mutation.data;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-12">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <span className="text-primary">{">_"}</span>
          <h1 className="text-2xl font-bold tracking-tight">PyReflect</h1>
          <Badge variant="outline" className="border-primary/40 text-primary">
            self-reflecting agent
          </Badge>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Paste Python code. The agent runs a structural pass, drafts a review, then critiques its
          own draft before returning errors, suggestions, and corrected code.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-border bg-card p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">input.py</span>
            <button
              type="button"
              onClick={() => setCode(SAMPLE)}
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              load sample
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="h-[380px] w-full resize-none bg-transparent p-4 text-sm leading-6 text-foreground outline-none"
            placeholder="# paste your Python code here"
          />
          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <Button
              onClick={() => mutation.mutate(code)}
              disabled={mutation.isPending || !code.trim()}
            >
              {mutation.isPending ? "Reflecting…" : "Review code"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {code.split("\n").length} lines
            </span>
          </div>
        </Card>

        <div className="space-y-4">
          {mutation.isError && (
            <Card className="border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {(mutation.error as Error).message || "Review failed. Please try again."}
            </Card>
          )}

          {mutation.isPending && (
            <Card className="space-y-3 p-6 text-sm text-muted-foreground">
              <p>Pass 1 — parsing structure and drafting findings…</p>
              <p>Pass 2 — the agent critiques and refines its own review…</p>
            </Card>
          )}

          {!mutation.isPending && !result && (
            <Card className="p-6 text-sm text-muted-foreground">
              Results appear here: detected errors, concrete suggestions, and the corrected file.
            </Card>
          )}

          {result && (
            <>
              <Card className="p-5">
                <h2 className="text-sm font-bold text-primary">Summary</h2>
                <p className="mt-2 text-sm leading-6 text-foreground">{result.summary}</p>
                {result.refinementNotes && (
                  <p className="mt-3 border-l-2 border-accent/60 pl-3 text-xs leading-5 text-muted-foreground">
                    <span className="text-accent">reflection:</span> {result.refinementNotes}
                  </p>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-bold text-primary">
                  Issues &amp; suggestions ({result.issues.length})
                </h2>
                <ul className="mt-4 space-y-4">
                  {result.issues.map((issue, i) => (
                    <li key={i} className="border-l-2 border-border pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] uppercase ${
                            severityStyles[issue.severity] ?? severityStyles["style"]
                          }`}
                        >
                          {issue.severity}
                        </span>
                        {issue.line > 0 && (
                          <span className="text-xs text-muted-foreground">line {issue.line}</span>
                        )}
                        <span className="text-sm font-medium">{issue.title}</span>
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                        {issue.explanation}
                      </p>
                      <p className="mt-1.5 text-sm leading-6">
                        <span className="text-primary">fix →</span> {issue.suggestion}
                      </p>
                    </li>
                  ))}
                  {result.issues.length === 0 && (
                    <li className="text-sm text-muted-foreground">No issues found.</li>
                  )}
                </ul>
              </Card>

              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">corrected.py</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(result.correctedCode)}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    copy
                  </button>
                </div>
                <pre className="overflow-x-auto p-4 text-sm leading-6">
                  <code>{result.correctedCode}</code>
                </pre>
              </Card>

              {result.staticFindings.length > 0 && (
                <Card className="p-5">
                  <h2 className="text-sm font-bold text-accent">Structural pre-pass</h2>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {result.staticFindings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
