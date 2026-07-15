export type ValueTransform = "lowercase" | "uppercase" | "trim" | "date";

const splitTransformSpec = (transform: string): [string, string | undefined] => {
  const separatorIndex = transform.indexOf(":");
  if (separatorIndex === -1) return [transform, undefined];
  return [transform.slice(0, separatorIndex), transform.slice(separatorIndex + 1)];
};

const MS_PER_DAY = 86_400_000;

const parseDayOffset = (spec: string | undefined): number => {
  if (!spec) return 0;
  const match = spec.trim().match(/^([+-]?\d+)\s*([dw]?)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return match[2].toLowerCase() === "w" ? amount * 7 : amount;
};

const DATE_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric" }, // "Aug 12"
  long: { month: "long", day: "numeric" }, // "August 12"
  full: { weekday: "short", month: "short", day: "numeric" }, // "Mon, Aug 12"
  numeric: { year: "numeric", month: "2-digit", day: "2-digit" }, // locale numeric
};

const applyDateTransform = (currentValue: string, arg: string | undefined): string => {
  const [offsetSpec, formatKey] = splitTransformSpec(arg ?? "");
  const days = parseDayOffset(offsetSpec);
  const date = new Date(Date.now() + days * MS_PER_DAY);
  const options = DATE_FORMATS[(formatKey ?? "short").trim()] ?? DATE_FORMATS.short;
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    return currentValue;
  }
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
    case "date":
      return applyDateTransform(currentValue, arg);
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
