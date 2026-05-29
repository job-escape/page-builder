// use-styled-node.ts
import { css, CSSObject, SerializedStyles } from "@emotion/react";

import { resolveSeniorFactor, scaleSeniorStyles } from "../utils/scale-senior-styles";

function toCamelCase(prop: string): string {
  if (prop.startsWith("--")) {
    return prop;
  }

  return prop.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function parseStyleString(str: string): Record<string, string> {
  return (str ?? "").split(";").reduce<Record<string, string>>((result, decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return result;
    const prop = toCamelCase(decl.slice(0, idx).trim());
    const value = decl.slice(idx + 1).trim();
    if (prop && value) {
      return { ...result, [prop]: value };
    }
    return result;
  }, {});
}

function withHover(
  base: Record<string, string>,
  hover: Record<string, string>,
  disabled: Record<string, string>,
): CSSObject | undefined {
  if (!Object.keys(base).length && !Object.keys(hover).length && !Object.keys(disabled).length) {
    return undefined;
  }

  return {
    ...base,
    "&:hover": Object.keys(hover).length ? hover : undefined,
    "&:disabled": Object.keys(disabled).length ? disabled : undefined,
  };
}

export function useStyledNode(attribs: Record<string, string>): SerializedStyles {
  // When the element opts into senior mode, scale typography/spacing up.
  // No-op (identity) when the `senior` attribute is absent.
  const seniorFactor = resolveSeniorFactor(attribs);
  const parse = (value: string | undefined): Record<string, string> => {
    const parsed = parseStyleString(value ?? "");
    return seniorFactor ? scaleSeniorStyles(parsed, seniorFactor) : parsed;
  };

  const shared = parse(attribs.style);
  const sharedHover = parse(attribs["hover-style"]);
  const sharedDisabled = parse(attribs["disabled-style"]);
  const desktop = parse(attribs["desktop-style"]);
  const desktopHover = parse(attribs["desktop-hover-style"]);
  const desktopDisabled = parse(attribs["desktop-disabled-style"]);
  const mobile = parse(attribs["mobile-style"]);
  const mobileHover = parse(attribs["mobile-hover-style"]);
  const mobileDisabled = parse(attribs["mobile-disabled-style"]);

  return css({
    ...shared,
    "&:hover": Object.keys(sharedHover).length ? sharedHover : undefined,
    "&:disabled": Object.keys(sharedDisabled).length ? sharedDisabled : undefined,
    "@media (min-width: 1024px)": withHover(
      desktop,
      Object.keys(desktopHover).length ? { ...sharedHover, ...desktopHover } : sharedHover,
      Object.keys(desktopDisabled).length
        ? { ...sharedDisabled, ...desktopDisabled }
        : sharedDisabled,
    ),
    "@media (max-width: 767px)": withHover(
      mobile,
      Object.keys(mobileHover).length ? { ...sharedHover, ...mobileHover } : sharedHover,
      Object.keys(mobileDisabled).length
        ? { ...sharedDisabled, ...mobileDisabled }
        : sharedDisabled,
    ),
  });
}
