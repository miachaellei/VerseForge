export type TextDiffKind = "same" | "added" | "removed";

export interface TextDiffLine {
  kind: TextDiffKind;
  text: string;
}

/** Deterministic line-level diff for review UI; it never mutates either input. */
export function diffText(previous: string, current: string): TextDiffLine[] {
  const left = previous.split("\n");
  const right = current.split("\n");
  const rows: TextDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ kind: "same", text: left[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (i + 1 < left.length && j < right.length && left[i + 1] === right[j]) {
      rows.push({ kind: "removed", text: left[i] });
      i += 1;
      continue;
    }
    if (j + 1 < right.length && i < left.length && left[i] === right[j + 1]) {
      rows.push({ kind: "added", text: right[j] });
      j += 1;
      continue;
    }
    if (i < left.length) rows.push({ kind: "removed", text: left[i++] });
    if (j < right.length) rows.push({ kind: "added", text: right[j++] });
  }
  return rows;
}
