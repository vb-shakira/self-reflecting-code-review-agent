export type StaticFinding = {
  line: number;
  message: string;
};

const BLOCK_KEYWORDS =
  /^(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b/;

/**
 * Lightweight structural pre-pass over the source (a cheap stand-in for
 * Python's AST parse) used to ground the model's review with concrete facts.
 */
export function staticScan(code: string): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const lines = code.split("\n");
  const stack: { ch: string; line: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

  let usesTabs = false;
  let usesSpaces = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const indent = raw.match(/^[ \t]*/)?.[0] ?? "";
    if (indent.includes("\t")) usesTabs = true;
    if (indent.includes(" ")) usesSpaces = true;

    let inStr: string | null = null;
    for (let c = 0; c < raw.length; c++) {
      const ch = raw[c]!;
      if (inStr) {
        if (ch === "\\") c++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") inStr = ch;
      else if (ch === "#") break;
      else if (ch === "(" || ch === "[" || ch === "{") stack.push({ ch, line: lineNo });
      else if (ch === ")" || ch === "]" || ch === "}") {
        const top = stack.pop();
        if (!top || top.ch !== pairs[ch]) {
          findings.push({ line: lineNo, message: `Unmatched closing "${ch}"` });
        }
      }
    }

    const stripped = raw.trim().replace(/#.*$/, "").trimEnd();
    if (stripped && BLOCK_KEYWORDS.test(stripped) && !stripped.endsWith(":") && !stripped.endsWith("\\")) {
      findings.push({ line: lineNo, message: "Block statement appears to be missing a trailing ':'" });
    }
    if (/^print\s+[^(=\s]/.test(stripped)) {
      findings.push({ line: lineNo, message: "Python 2 style print statement (needs parentheses)" });
    }
    if (/^(if|while)\b.*[^=!<>]=[^=].*:$/.test(stripped)) {
      findings.push({ line: lineNo, message: "Assignment '=' used where comparison '==' may be intended" });
    }
  });

  for (const open of stack) {
    findings.push({ line: open.line, message: `Unclosed "${open.ch}"` });
  }
  if (usesTabs && usesSpaces) {
    findings.push({ line: 1, message: "Mixed tabs and spaces in indentation" });
  }

  return findings.slice(0, 25);
}
