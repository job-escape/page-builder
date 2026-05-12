type AnyRecord = Record<string, unknown>;

type Segment = { kind: "key"; key: string } | { kind: "index"; index: number } | { kind: "push" };

const parsePath = (path: string): Segment[] => {
  const segments: Segment[] = [];
  const re = /[^.[\]]+|\[(\d*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(path)) !== null) {
    const [token, bracketContent] = match;

    if (token.startsWith("[")) {
      if (bracketContent === "") {
        segments.push({ kind: "push" });
      } else {
        segments.push({ kind: "index", index: Number(bracketContent) });
      }
      continue;
    }

    segments.push({ kind: "key", key: token });
  }

  return segments;
};

const ensureContainer = (
  parent: AnyRecord | unknown[],
  segment: Segment,
  nextSegment: Segment,
): { container: AnyRecord | unknown[]; resolvedSegment: Segment } => {
  const needsArray = nextSegment.kind === "index" || nextSegment.kind === "push";
  const childKey =
    segment.kind === "key" ? segment.key : segment.kind === "index" ? segment.index : -1;

  if (segment.kind === "push") {
    const arr = parent as unknown[];
    const fresh: AnyRecord | unknown[] = needsArray ? [] : {};
    arr.push(fresh);
    return { container: fresh, resolvedSegment: { kind: "index", index: arr.length - 1 } };
  }

  const existing =
    segment.kind === "key"
      ? (parent as AnyRecord)[segment.key]
      : (parent as unknown[])[segment.index];

  const isValidExisting = needsArray
    ? Array.isArray(existing)
    : existing !== null && typeof existing === "object" && !Array.isArray(existing);

  if (isValidExisting) {
    return { container: existing as AnyRecord | unknown[], resolvedSegment: segment };
  }

  const fresh: AnyRecord | unknown[] = needsArray ? [] : {};
  if (segment.kind === "key") {
    (parent as AnyRecord)[segment.key] = fresh;
  } else {
    (parent as unknown[])[segment.index] = fresh;
  }
  return { container: fresh, resolvedSegment: segment };
};

const assignLeaf = (parent: AnyRecord | unknown[], segment: Segment, value: unknown): void => {
  if (segment.kind === "push") {
    (parent as unknown[]).push(value);
    return;
  }
  if (segment.kind === "index") {
    (parent as unknown[])[segment.index] = value;
    return;
  }
  (parent as AnyRecord)[segment.key] = value;
};

export const setByPath = (target: AnyRecord, path: string, value: unknown): AnyRecord => {
  const segments = parsePath(path);
  if (segments.length === 0) return target;

  let cursor: AnyRecord | unknown[] = target;
  let currentSegment = segments[0];

  for (let i = 0; i < segments.length - 1; i += 1) {
    const nextSegment = segments[i + 1];
    const { container } = ensureContainer(cursor, currentSegment, nextSegment);
    cursor = container;
    currentSegment = nextSegment;
  }

  assignLeaf(cursor, currentSegment, value);
  return target;
};
