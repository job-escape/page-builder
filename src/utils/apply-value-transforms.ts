export type ValueTransform = "lowercase" | "uppercase" | "trim";

export const applyValueTransforms = (
  value: string | number | boolean | undefined | string[],
  transforms?: string[],
): string | number | boolean | undefined | string[] => {
  if (value === undefined || !transforms?.length || typeof value !== "string") {
    return value;
  }

  return transforms.reduce<string>((currentValue, transform) => {
    switch (transform) {
      case "lowercase":
        return currentValue.toLowerCase();
      case "uppercase":
        return currentValue.toUpperCase();
      case "trim":
        return currentValue.trim();
      default:
        return currentValue;
    }
  }, value);
};
