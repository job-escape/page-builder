// use-styled-node.ts
import { css, CSSObject, SerializedStyles } from "@emotion/react";

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
  const shared = parseStyleString(attribs.style ?? "");
  const sharedHover = parseStyleString(attribs["hover-style"] ?? "");
  const sharedDisabled = parseStyleString(attribs["disabled-style"] ?? "");
  const desktop = parseStyleString(attribs["desktop-style"] ?? "");
  const desktopHover = parseStyleString(attribs["desktop-hover-style"] ?? "");
  const desktopDisabled = parseStyleString(attribs["desktop-disabled-style"] ?? "");
  const mobile = parseStyleString(attribs["mobile-style"] ?? "");
  const mobileHover = parseStyleString(attribs["mobile-hover-style"] ?? "");
  const mobileDisabled = parseStyleString(attribs["mobile-disabled-style"] ?? "");

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
