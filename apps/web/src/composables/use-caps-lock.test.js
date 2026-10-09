// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { capsLockState, useCapsLock } from "./use-caps-lock";

afterEach(() => vi.restoreAllMocks());

describe("keyboard modifier state boundary", () => {
  it("reports a trusted keyboard's Caps Lock state rather than its key or Shift", () => {
    const event = { isTrusted: true, key: "a", shiftKey: false,
      getModifierState: modifier => modifier === "CapsLock" };
    expect(capsLockState(event)).toBe(true);
    expect(capsLockState({ ...event, key: "A", shiftKey: true, getModifierState: () => false })).toBe(false);
  });

  it("does not treat synthetic keys or events without modifier information as state changes", () => {
    expect(capsLockState({ isTrusted: false, getModifierState: () => true })).toBeNull();
    expect(capsLockState({ isTrusted: false, getModifierState: () => false })).toBeNull();
    expect(capsLockState({ isTrusted: true })).toBeNull();
  });
});

it("keeps the warning through typing, focus changes and unknown pointer state until the keyboard reports off", async () => {
  // Browser/OS event delivery is the boundary. jsdom cannot create trusted hardware events.
  const listeners = new Map();
  const source = {
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  };
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  });
  vi.spyOn(window, "removeEventListener").mockImplementation((type, listener) => listeners.get(type)?.delete(listener));
  const deliver = (type, state) => {
    source.dispatchEvent({ type, isTrusted: true, getModifierState: modifier => modifier === "CapsLock" && state });
  };
  const view = mount(defineComponent({
    setup() {
      const caps = useCapsLock();
      return () => h("p", { role: "status" }, caps.value ? "Caps Lock เปิดอยู่" : "");
    },
  }));
  try {
    deliver("keydown", true);
    await nextTick();
    expect(view.text()).toBe("Caps Lock เปิดอยู่");
    deliver("keyup", true);
    source.dispatchEvent(new Event("focusout"));
    deliver("pointerdown", false);
    source.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await nextTick();
    expect(view.text()).toBe("Caps Lock เปิดอยู่");
    deliver("keyup", false);
    await nextTick();
    expect(view.text()).toBe("");
    deliver("pointerdown", true);
    await nextTick();
    expect(view.text()).toBe("Caps Lock เปิดอยู่");
  } finally {
    view.unmount();
  }
});
