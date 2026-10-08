// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType, RouterView } from "vue-router";
import { useRouteFocus } from "./use-route-focus";

const page = (title) => defineComponent({ render: () => [h("h1", title), h("input", { "aria-label": "filter" })] });
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); document.body.innerHTML = ""; vi.restoreAllMocks(); });

async function app(extraRoutes = []) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/one", component: page("One") }, { path: "/two", component: page("Two") },
    { path: "/empty", component: { render: () => h("p", "No heading") } },
    { path: "/redirect", redirect: "/two" }, ...extraRoutes,
  ] });
  await router.push("/one");
  await router.isReady();
  const root = defineComponent({ setup() { useRouteFocus(); return () => h("main", { id: "main-content", tabindex: "-1" }, h(RouterView)); } });
  const wrapper = mount(root, { attachTo: document.body, global: { plugins: [router] } });
  wrappers.push(wrapper);
  await flushPromises();
  return { router, wrapper };
}

test("successful lazy navigation focuses once after render, preserving router scroll", async () => {
  let renderPage;
  const { router, wrapper } = await app([{ path: "/lazy", component: () => new Promise((resolve) => { renderPage = resolve; }) }]);
  wrapper.get("input").element.focus();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  const pending = router.push("/lazy");
  await flushPromises();
  expect(focus).not.toHaveBeenCalled();
  renderPage(page("Lazy"));
  await pending;
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.get("h1").element);
  expect(document.activeElement.textContent).toBe("Lazy");
  expect(document.activeElement.getAttribute("tabindex")).toBe("-1");
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
});

test("query/hash, duplicate, aborted and failed navigations do not move focus", async () => {
  const { router, wrapper } = await app([{ path: "/blocked", component: page("Blocked") }, { path: "/error", component: page("Error") }]);
  router.beforeEach((to) => { if (to.path === "/blocked") return false; if (to.path === "/error") throw new Error("fixture navigation failure"); });
  router.onError(() => {});
  const input = wrapper.get("input").element;
  input.focus();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await router.push("/one?filter=1#row");
  await router.push("/one?filter=1#row");
  const failure = await router.push("/blocked");
  expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true);
  await expect(router.push("/error")).rejects.toThrow("fixture navigation failure");
  await flushPromises();
  expect(document.activeElement).toBe(input);
  expect(focus).not.toHaveBeenCalled();
});

test("a superseded navigation cannot steal focus from the completed destination", async () => {
  let finishGuard;
  const { router, wrapper } = await app([{ path: "/slow", component: page("Slow") }]);
  router.beforeEach((to) => to.path === "/slow" ? new Promise((resolve) => { finishGuard = resolve; }) : true);
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  const pending = router.push("/slow");
  await flushPromises();
  await router.push("/two");
  await nextTick();
  finishGuard(true);
  const cancelled = await pending;
  expect(isNavigationFailure(cancelled, NavigationFailureType.cancelled)).toBe(true);
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.get("h1").element);
  expect(document.activeElement.textContent).toBe("Two");
  expect(focus).toHaveBeenCalledTimes(1);
});

test("redirect focuses only the final heading and missing heading falls back to main", async () => {
  const { router, wrapper } = await app();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await router.push("/redirect");
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.get("h1").element);
  expect(focus).toHaveBeenCalledTimes(1);
  await router.push("/empty");
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.get("main").element);
  expect(focus).toHaveBeenCalledTimes(2);
});
