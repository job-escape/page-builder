type AnyRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is AnyRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const deepMerge = (target: unknown, source: unknown): unknown => {
  if (Array.isArray(target) && Array.isArray(source)) {
    const result = target.slice();
    for (let i = 0; i < source.length; i += 1) {
      result[i] = i < target.length ? deepMerge(target[i], source[i]) : source[i];
    }
    return result;
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const result: AnyRecord = { ...target };
    for (const key of Object.keys(source)) {
      result[key] = key in target ? deepMerge(target[key], source[key]) : source[key];
    }
    return result;
  }

  return source;
};

export const deepMergeAll = (...sources: unknown[]): AnyRecord => {
  let acc: unknown = {};
  for (const src of sources) {
    if (src === undefined || src === null) continue;
    acc = deepMerge(acc, src);
  }
  return isPlainObject(acc) ? acc : {};
};
