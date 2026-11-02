import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parts(version) {
  if (typeof version !== "string" || !STABLE.test(version)) {
    throw new Error(`Expected a stable version such as 0.1.1, received ${JSON.stringify(version)}`);
  }
  const numbers = version.split(".").map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw new Error("Version component is too large");
  return numbers;
}

/** Read and validate every version field that defines the installed Jig app. */
export function readVersions(root) {
  const files = ["package.json", "apps/desktop/package.json", "package-lock.json"];
  const [project, desktop, lock] = files.map((file) => JSON.parse(readFileSync(join(root, file), "utf8")));
  if (project.name !== "jig" || desktop.name !== "@jig/desktop" || lock.name !== "jig") {
    throw new Error("This helper must run against the Jig repository manifests");
  }
  const versions = [
    project.version,
    desktop.version,
    lock.version,
    lock.packages?.[""]?.version,
    lock.packages?.["apps/desktop"]?.version,
  ];
  for (const version of versions) parts(version);
  if (new Set(versions).size !== 1) {
    throw new Error(`App version fields disagree: ${versions.join(", ")}. Resolve this before releasing.`);
  }
  return { current: project.version, files, project, desktop, lock };
}

/** Validate the whole change before writing; unrelated workspace versions stay untouched. */
export function setVersion(root, next, { dryRun = false } = {}) {
  const data = readVersions(root);
  const before = parts(data.current);
  const after = parts(next);
  const difference = after.map((number, i) => number - before[i]).find((number) => number !== 0);
  if (!difference || difference < 0) throw new Error(`Release version must exceed ${data.current}`);
  if (!dryRun) {
    data.project.version = next;
    data.desktop.version = next;
    data.lock.version = next;
    data.lock.packages[""].version = next;
    data.lock.packages["apps/desktop"].version = next;
    const documents = [data.project, data.desktop, data.lock];
    for (const [index, file] of data.files.entries()) {
      writeFileSync(join(root, file), `${JSON.stringify(documents[index], null, 2)}\n`, "utf8");
    }
  }
  return { from: data.current, to: next, dryRun, files: data.files };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const versions = args.filter((arg) => arg !== "--dry-run");
    if (versions.length > 1 || (dryRun && !versions.length)) {
      throw new Error("Usage: node .agents/skills/jig-release/scripts/version.mjs [VERSION [--dry-run]]");
    }
    const result = versions.length
      ? setVersion(root, versions[0], { dryRun })
      : { current: readVersions(root).current };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
