/**
 * The new runtime is isolated, and this is what enforces it.
 *
 * The compiled-funnel runtime is a beta surface built alongside the shipped one.
 * `funnel` and `frontend-alpha` run pinned 0.2.x versions of that shipped
 * surface, and nothing here may reach it or be reached by it — otherwise "beta,
 * isolated" is a promise in a document rather than a property of the code.
 *
 * Two directions, both checked:
 *   1. nothing in `src/runtime/` imports anything outside `src/runtime/`
 *   2. nothing outside `src/runtime/` imports anything from it
 *
 * A dependency added in either direction fails this test, which is the point.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const SRC = resolve(__dirname, "..");
const RUNTIME = resolve(__dirname);

/** Every `.ts`/`.tsx` file under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Module specifiers from `import ... from "x"`, `export ... from "x"`, `import("x")`. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s[^;]*?from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
  ];
  patterns.forEach((pattern) => {
    let match = pattern.exec(text);
    while (match !== null) {
      found.push(match[1]);
      match = pattern.exec(text);
    }
  });
  return found;
}

describe("the beta runtime is isolated", () => {
  it("imports nothing from outside src/runtime", () => {
    const escapes: string[] = [];

    sourceFiles(RUNTIME).forEach((file) => {
      importsOf(file).forEach((specifier) => {
        // Bare specifiers are packages, not this repo's existing surface.
        if (!specifier.startsWith(".")) return;
        const target = resolve(file, "..", specifier);
        if (!target.startsWith(RUNTIME)) {
          escapes.push(`${relative(SRC, file)} → ${specifier}`);
        }
      });
    });

    expect(escapes).toEqual([]);
  });

  it("is imported by nothing outside src/runtime", () => {
    const intrusions: string[] = [];

    sourceFiles(SRC)
      .filter((file) => !file.startsWith(RUNTIME))
      .forEach((file) => {
        importsOf(file).forEach((specifier) => {
          if (!specifier.startsWith(".")) return;
          const target = resolve(file, "..", specifier);
          if (target.startsWith(RUNTIME)) {
            intrusions.push(`${relative(SRC, file)} → ${specifier}`);
          }
        });
      });

    expect(intrusions).toEqual([]);
  });

  it("stays out of the shipped entry points", () => {
    // `.` and `./client` are what pinned consumers resolve. The beta surface
    // gets its own entry so that installing the package cannot reach it.
    ["index.ts", "server.ts", "client.ts"].forEach((entry) => {
      const text = readFileSync(join(SRC, entry), "utf8");
      expect(text).not.toMatch(/runtime/);
    });
  });
});
