export interface DiffLine {
  kind: "same" | "add" | "remove";
  text: string;
  oldLine?: number;
  newLine?: number;
}
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"),
    b = after.split("\n");
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - end - 1] === b[b.length - end - 1]
  )
    end++;
  const left = a.slice(start, a.length - end),
    right = b.slice(start, b.length - end);
  let operations: { kind: DiffLine["kind"]; text: string }[] = a
    .slice(0, start)
    .map((text) => ({ kind: "same", text }));
  // Bound browser work for large generated files. The fallback still reconstructs both versions exactly.
  if ((left.length + 1) * (right.length + 1) <= 250000) {
    const width = right.length + 1,
      table = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--)
      for (let j = right.length - 1; j >= 0; j--)
        table[i * width + j] =
          left[i] === right[j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0,
      j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        operations.push({ kind: "same", text: left[i++] });
        j++;
      } else if (
        i < left.length &&
        (j === right.length ||
          table[(i + 1) * width + j] >= table[i * width + j + 1])
      )
        operations.push({ kind: "remove", text: left[i++] });
      else operations.push({ kind: "add", text: right[j++] });
    }
  } else {
    operations = operations.concat(
      left.map((text) => ({ kind: "remove" as const, text })),
      right.map((text) => ({ kind: "add" as const, text })),
    );
  }
  operations = operations.concat(
    a.slice(a.length - end).map((text) => ({ kind: "same" as const, text })),
  );
  let oldLine = 0,
    newLine = 0;
  return operations.map((item) => ({
    ...item,
    oldLine: item.kind === "add" ? undefined : ++oldLine,
    newLine: item.kind === "remove" ? undefined : ++newLine,
  }));
}
