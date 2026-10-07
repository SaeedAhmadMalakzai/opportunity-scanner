import { test } from "node:test";
import assert from "node:assert/strict";
import { keyAction, isTextEntry, isActivatable } from "../extension/src/popup/keyboard.js";

/** Minimal stand-in for an Element: tag name plus a closest() that matches its own tag or role. */
function el(tagName, { role } = {}) {
  const self = {
    tagName,
    closest(selector) {
      const parts = selector.split(",").map((s) => s.trim().toLowerCase());
      const matches = parts.includes(tagName.toLowerCase()) || (role && parts.includes(`[role=${role}]`));
      return matches ? self : null;
    }
  };
  return self;
}
const body = el("BODY");

test("isTextEntry / isActivatable classify targets", () => {
  assert.equal(isTextEntry(el("INPUT")), true);
  assert.equal(isTextEntry(el("TEXTAREA")), true);
  assert.equal(isTextEntry(el("BUTTON")), false);
  assert.equal(isActivatable(el("BUTTON")), true);
  assert.equal(isActivatable(el("A")), true);
  assert.equal(isActivatable(el("DIV", { role: "tab" })), true);
  assert.equal(isActivatable(body), false);
});

test("A6: Enter on a focused button activates the button, not the focused notice", () => {
  assert.equal(keyAction({ key: "Enter", target: el("BUTTON") }), null);
  assert.equal(keyAction({ key: "Enter", target: el("A") }), null);
  assert.equal(keyAction({ key: "Enter", target: body }), "open");
  assert.equal(keyAction({ key: "o", target: el("BUTTON") }), "open", "o is unchanged");
});

test("keyAction ignores typing and modifier chords but always reports Escape", () => {
  assert.equal(keyAction({ key: "j", target: el("INPUT") }), null);
  assert.equal(keyAction({ key: "s", target: body, metaKey: true }), null);
  assert.equal(keyAction({ key: "Escape", target: el("INPUT") }), "escape");
  assert.equal(keyAction({ key: "j", target: body }), "next");
  assert.equal(keyAction({ key: "ArrowUp", target: body }), "prev");
  assert.equal(keyAction({ key: "q", target: body }), null);
});
