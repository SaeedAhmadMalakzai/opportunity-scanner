import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
export function fixture(name) { return readFileSync(join(dir, name), "utf8"); }
export function fixtureJson(name) { return JSON.parse(fixture(name)); }
