import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHtml, decodeEntities, splitBlocks, anchors, metaContent, extractAfghanLocation } from "../extension/src/lib/html.js";

test("stripHtml removes scripts, styles, tags and decodes entities", () => {
  const html = `<div><script>x()</script><style>a{}</style><p>Call &amp; <b>tender</b> &#8211; Herat&nbsp;&#x27;26</p></div>`;
  assert.equal(stripHtml(html), "Call & tender – Herat '26");
});

test("decodeEntities leaves unknown entities untouched", () => {
  assert.equal(decodeEntities("&unknown; &lt;"), "&unknown; <");
});

test("splitBlocks splits at each marker occurrence", () => {
  const blocks = splitBlocks(`<x><div class="card">a</div><div class="card">b</div>`, /<div class="card">/);
  assert.equal(blocks.length, 2);
  assert.match(blocks[1], /b<\/div>/);
});

test("anchors extracts href and inner html", () => {
  const list = anchors(`<a class="t" href='/x'>One</a><a>no href</a><a href="https://b.org/&amp;q">Two</a>`);
  assert.deepEqual(list.map((a) => a.href), ["/x", "https://b.org/&q"]);
  assert.match(list[0].attrs, /class="t"/);
});

test("metaContent reads og and name meta tags in either attribute order", () => {
  assert.equal(metaContent(`<meta property="og:title" content="A">`, "og:title"), "A");
  assert.equal(metaContent(`<meta content="B" name="description">`, "description"), "B");
  assert.equal(metaContent(``, "description"), "");
});

test("extractAfghanLocation finds provinces", () => {
  assert.equal(extractAfghanLocation("Supply of kits to Badakhshan province"), "Badakhshan");
  assert.equal(extractAfghanLocation("Nairobi office"), "");
});
