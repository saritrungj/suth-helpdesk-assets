// @vitest-environment jsdom
import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import UiButton from "./UiButton.vue";

test("internal buttons retain their router href for keyboard and link navigation", async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/", component: { template: "<div />" } },
    { path: "/expense", component: { template: "<div />" } },
  ] });
  await router.push("/");
  await router.isReady();
  const wrapper = mount(UiButton, { props: { to: { path: "/expense", query: { tab: "department" } } }, slots: { default: "Report" }, global: { plugins: [router] } });
  expect(wrapper.get("a").attributes("href")).toBe("/expense?tab=department");
  wrapper.unmount();
});

test("external links keep their destination", () => {
  const wrapper = mount(UiButton, { props: { href: "https://example.com" }, slots: { default: "Report" } });
  expect(wrapper.get("a").attributes("href")).toBe("https://example.com");
  wrapper.unmount();
});
