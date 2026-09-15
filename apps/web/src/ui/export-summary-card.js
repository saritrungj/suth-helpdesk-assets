// A portable image composed from data, not a screenshot of application chrome.
// Callers supply all copy, values and semantic colors; no domain dependencies.
export async function exportSummaryCard({ title, context, metrics, chartTitle, bars, footnote, filename, colors }) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const font = getComputedStyle(document.body).fontFamily;
  const write = (text, x, y, size = 24, color = colors.ink, weight = 400, maxWidth = 1440) => {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(String(text), x, y, maxWidth);
  };
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, 1600, 1000);
  ctx.fillStyle = colors.hero;
  ctx.fillRect(0, 0, 1600, 365);
  write(title, 64, 76, 38, colors.onHero, 600);
  write(context, 64, 122, 22, colors.onHero);
  metrics.slice(0, 3).forEach((metric, index) => {
    const x = 64 + index * 505;
    write(metric.label, x, 206, 24, colors.onHero);
    write(metric.value, x, 274, 48, colors.onHero, 600, 460);
    write(metric.unit, x, 317, 22, colors.onHero);
  });
  write(chartTitle, 64, 430, 28, colors.ink, 600);
  const maximum = Math.max(1, ...bars.map(bar => bar.value));
  const step = 1440 / Math.max(1, bars.length);
  bars.forEach((bar, index) => {
    const x = 80 + index * step;
    const height = bar.value / maximum * 270;
    ctx.fillStyle = colors.accent;
    if (bar.value !== null) ctx.fillRect(x + step * 0.22, 805 - height, step * 0.5, Math.max(2, height));
    write(bar.displayValue, x, 785 - height, 19, colors.ink, 500, step - 8);
    write(bar.label, x, 846, 18, colors.ink, 400, step - 8);
  });
  write(footnote, 64, 930, 20, colors.ink);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export failed');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
