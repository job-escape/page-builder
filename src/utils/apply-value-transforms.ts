export type ValueTransform = "lowercase" | "uppercase" | "trim";

const splitTransformSpec = (transform: string): [string, string | undefined] => {
  const separatorIndex = transform.indexOf(":");
  if (separatorIndex === -1) return [transform, undefined];
  return [transform.slice(0, separatorIndex), transform.slice(separatorIndex + 1)];
};

const applyOneTransform = (currentValue: string, transform: string): string => {
  const [name, arg] = splitTransformSpec(transform);

  switch (name) {
    case "lowercase":
      return currentValue.toLowerCase();
    case "uppercase":
      return currentValue.toUpperCase();
    case "trim":
      return currentValue.trim();
    case "before": {
      if (!arg) return currentValue;
      const index = currentValue.indexOf(arg);
      return index === -1 ? currentValue : currentValue.slice(0, index).trim();
    }
    case "after": {
      if (!arg) return currentValue;
      const index = currentValue.lastIndexOf(arg);
      return index === -1 ? currentValue : currentValue.slice(index + arg.length).trim();
    }
    case "firstword":
      return currentValue.trim().split(/\s+/)[0] ?? currentValue;
    case "initials": {
      const count = arg ? Number(arg) : undefined;
      const words = currentValue.trim().split(/\s+/).filter(Boolean);
      const picked = count && count > 0 ? words.slice(0, count) : words;
      return picked
        .map((word) => word[0] ?? "")
        .join("")
        .toUpperCase();
    }
    case "regex": {
      if (!arg) return currentValue;
      const [pattern, flags] = splitTransformSpec(arg);
      try {
        const match = currentValue.match(new RegExp(pattern, flags));
        if (!match) return currentValue;
        return match[1] ?? match[0];
      } catch {
        return currentValue;
      }
    }
    default:
      return currentValue;
  }
};

export const applyValueTransforms = (
  value: string | number | boolean | undefined | string[],
  transforms?: string[],
): string | number | boolean | undefined | string[] => {
  if (value === undefined || !transforms?.length || typeof value !== "string") {
    return value;
  }

  return transforms.reduce<string>(applyOneTransform, value);
};
