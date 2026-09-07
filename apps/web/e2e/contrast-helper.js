/** Browser-side measurement seam shared by page audits and isolated regression tests. */
export function createContrastTools() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  function rgba(color) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const p = ctx.getImageData(0, 0, 1, 1).data;
    return [p[0], p[1], p[2], p[3] / 255];
  }
  function luminance(rgb) {
    const channels = rgb.slice(0, 3).map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function ratio(fg, bg) {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function over(front, back) {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) =>
      (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha
    ).concat(alpha);
  }
  function attenuate(pixel, opacity) {
    return [...pixel.slice(0, 3), pixel[3] * opacity];
  }
  function measureText(el, pseudo = null) {
    const textStyle = getComputedStyle(el, pseudo);
    let fg = rgba(textStyle.color);
    if (pseudo) fg = attenuate(fg, Number(textStyle.opacity));
    let bg = [0, 0, 0, 0];
    // Composite an element as a group before applying its opacity. Multiplying
    // the text opacity alone gives the wrong result when that group has a fill.
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage !== "none" || s.filter !== "none" ||
          s.mixBlendMode !== "normal" || s.backdropFilter !== "none") {
        return { unsupported: "image, filter or blend requires a separate visual measurement" };
      }
      const fill = rgba(s.backgroundColor);
      fg = attenuate(over(fg, fill), Number(s.opacity));
      bg = attenuate(over(bg, fill), Number(s.opacity));
    }
    fg = over(fg, [255, 255, 255, 1]);
    bg = over(bg, [255, 255, 255, 1]);
    return { ratio: ratio(fg, bg), foreground: fg.slice(0, 3), background: bg.slice(0, 3) };
  }
  function isVisible(el) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      // Visually hidden screen-reader text is not a rendered text contrast case.
      if (s.clipPath === "inset(50%)" || s.clip === "rect(0px, 0px, 0px, 0px)") return false;
    }
    return true;
  }
  function auditText(scope = "body") {
    const failures = [];
    const unsupported = [];
    let measured = 0;
    function inspect(el, kind, text, pseudo = null) {
      const style = getComputedStyle(el, pseudo);
      const px = parseFloat(style.fontSize);
      const need = px >= 24 || (px >= 56 / 3 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      const result = measureText(el, pseudo);
      const item = { kind, text: text.slice(0, 50), tag: el.tagName.toLowerCase(), need, ...result };
      if (result.unsupported) unsupported.push(item);
      else {
        measured += 1;
        if (result.ratio < need) failures.push(item);
      }
    }
    for (const el of document.querySelectorAll(`${scope}, ${scope} *`)) {
      if (!isVisible(el) || el.matches("script, style") ||
          el.closest(":disabled, [aria-disabled='true']")) continue;
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim()).filter(Boolean).join(" ");
      if (own) inspect(el, "text", own);
      if (el.matches("input:not([type=hidden]), textarea")) {
        // Do not put real field values/passwords into reports or attachments.
        const label = el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase();
        if (el.value) inspect(el, "value", label);
        else if (el.placeholder) inspect(el, "placeholder", el.placeholder, "::placeholder");
      }
      if (el.matches("select") && el.selectedOptions.length) {
        inspect(el, "value", el.getAttribute("aria-label") || el.id || "select");
      }
    }
    return { failures, unsupported, measured };
  }
  return { measureText, auditText, isVisible, rgba, ratio };
}

export const CONTRAST_HELPERS = `const contrast = (${createContrastTools.toString()})();`;
