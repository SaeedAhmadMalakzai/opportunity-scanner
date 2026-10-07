import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONNECTORS } from "../extension/src/lib/connectors/index.js";
import { GOV_AF_HOSTS } from "../extension/src/lib/connectors/gov-af.js";

const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const hostPermissions = new Set(manifest.host_permissions);
const UNGM_PAGE_WITH_TOKEN = '<form><input name="__RequestVerificationToken" type="hidden" value="fake-token-1234567890" /></form>';

test("every Afghan ministry host is in host_permissions", () => {
  for (const host of GOV_AF_HOSTS) assert.ok(hostPermissions.has(host), `${host} missing from manifest`);
});

test("every origin a connector fetches is covered by host_permissions", async () => {
  const origins = new Set();
  const record = (url) => origins.add(new URL(url).origin);
  const ctx = {
    settings: { reliefwebAppName: "x" },
    log() {},
    async fetchText(url) { record(url); return url.includes("ungm.org/Public/Notice") && !url.endsWith("/Search") ? UNGM_PAGE_WITH_TOKEN : ""; },
    async fetchJson(url) { record(url); return {}; }
  };
  for (const [id, connector] of Object.entries(CONNECTORS)) {
    const items = await connector.fetchItems(ctx);
    assert.ok(Array.isArray(items), `${id} returns an array`);
  }
  assert.ok(origins.size >= 15, `recorded ${origins.size} origins`);
  for (const origin of origins) assert.ok(hostPermissions.has(`${origin}/*`), `${origin}/* missing from host_permissions`);
});
