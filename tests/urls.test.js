import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeHttpsUrl, resolveHttpUrl, sanitizeUrlList, rejectedUrls, canonicalUrl, isPrivateHostname, originPattern } from "../extension/src/lib/urls.js";

test("isSafeHttpsUrl accepts public https and rejects http, credentials, and private hosts", () => {
  assert.equal(isSafeHttpsUrl("https://www.acbar.org/en/jobs"), true);
  assert.equal(isSafeHttpsUrl("http://www.acbar.org/"), false);
  assert.equal(isSafeHttpsUrl("https://user:pw@example.org/"), false);
  assert.equal(isSafeHttpsUrl("https://localhost/"), false);
  assert.equal(isSafeHttpsUrl("https://10.0.0.5/"), false);
  assert.equal(isSafeHttpsUrl("https://169.254.169.254/latest"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("not a url"), false);
});

test("isPrivateHostname covers ipv6 loopback, link-local and mapped ipv4", () => {
  assert.equal(isPrivateHostname("[::1]"), true);
  assert.equal(isPrivateHostname("fe80::1"), true);
  assert.equal(isPrivateHostname("::ffff:192.168.1.1"), true);
  assert.equal(isPrivateHostname("8.8.8.8"), false);
});

test("resolveHttpUrl resolves relative paths and strips fragments", () => {
  assert.equal(resolveHttpUrl("/Public/Notice/1", "https://www.ungm.org/"), "https://www.ungm.org/Public/Notice/1");
  assert.equal(resolveHttpUrl("details/9#top", "https://www.acbar.org/en/jobs/"), "https://www.acbar.org/en/jobs/details/9");
  assert.equal(resolveHttpUrl("mailto:x@y.z", "https://a.org/"), null);
  assert.equal(resolveHttpUrl("http://a.org/x", "https://a.org/"), null);
});

test("sanitizeUrlList strips bullets, dedupes, and reports rejects", () => {
  const input = ["• https://a.org/x", "- https://a.org/x", "http://insecure.org", "", "https://b.org/y "];
  assert.deepEqual(sanitizeUrlList(input), ["https://a.org/x", "https://b.org/y"]);
  assert.deepEqual(rejectedUrls(input), ["http://insecure.org"]);
});

test("canonicalUrl sorts query, drops hash and trailing slash", () => {
  assert.equal(canonicalUrl("https://A.org/path/?b=2&a=1#frag"), "https://a.org/path/?a=1&b=2");
  assert.equal(canonicalUrl("https://a.org/path/"), "https://a.org/path");
  assert.equal(canonicalUrl("https://a.org/"), "https://a.org/");
  assert.equal(canonicalUrl("garbage"), "garbage");
});

test("originPattern yields a host permission pattern", () => {
  assert.equal(originPattern("https://x.org/a/b?c"), "https://x.org/*");
  assert.equal(originPattern("nope"), null);
});
