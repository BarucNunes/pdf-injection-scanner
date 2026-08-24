/**
 * Detector de texto visualmente oculto.
 *
 * Aceita as paginas retornadas por extractPdfData(). Para as verificacoes de
 * cor e cobertura, o chamador pode enriquecer cada bloco com `color`,
 * `backgroundColor`, `zIndex` e `elements`. Cores aceitas: #rgb, #rrggbb,
 * rgb(...), [r,g,b] ou { r, g, b }.
 */

const DEFAULT_OPTIONS = {
  colorDistanceThreshold: 28,
  boundsTolerance: 0.5,
  minimumCoverRatio: 0.8,
  snippetLength: 200
};

function normaliseColor(value) {
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map(Number);
  if (value && typeof value === "object" && ["r", "g", "b"].every((key) => key in value)) {
    return [Number(value.r), Number(value.g), Number(value.b)];
  }
  if (typeof value !== "string") return null;

  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split("").map((part) => part + part).join("") : hex[1];
    return [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16));
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)/i);
  return rgb ? rgb.slice(1, 4).map(Number) : null;
}

function colorDistance(first, second) {
  return Math.sqrt(first.reduce((total, component, index) => total + (component - second[index]) ** 2, 0));
}

function snippet(text, maxLength) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function boxOf(item) {
  if (!item) return null;
  const position = item.position || item.bounds || item;
  const x = Number(position.x);
  const y = Number(position.y);
  const width = Number(position.width);
  const height = Number(position.height);
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function intersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
}

function finding(category, page, block, explanation, options) {
  return { categoria: category, pagina: page, trecho: snippet(block.text, options.snippetLength), explicacao: explanation };
}

/**
 * @param {Array<{pageNumber?: number, width?: number, height?: number, mediaBox?: *, backgroundColor?: *, blocks?: Array, elements?: Array}>} pages
 * @param {Partial<typeof DEFAULT_OPTIONS>} options
 * @returns {Array<{categoria: string, pagina: number, trecho: string, explicacao: string}>}
 */
export function detectVisualAnomalies(pages, options = {}) {
  if (!Array.isArray(pages)) throw new TypeError("pages deve ser um array de paginas extraidas.");
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const findings = [];

  pages.forEach((page, pageIndex) => {
    const pageNumber = page.pageNumber ?? pageIndex + 1;
    const mediaBox = boxOf(page.mediaBox) || { x: 0, y: 0, width: Number(page.width), height: Number(page.height) };
    const pageBackground = normaliseColor(page.backgroundColor) || [255, 255, 255];
    const elements = Array.isArray(page.elements) ? page.elements : [];

    (page.blocks || []).forEach((block, blockIndex) => {
      if (!block || !String(block.text || "").trim()) return;
      const blockBox = boxOf(block);
      const textColor = normaliseColor(block.color);
      const background = normaliseColor(block.backgroundColor) || pageBackground;

      if (textColor && colorDistance(textColor, background) <= settings.colorDistanceThreshold) {
        findings.push(finding("cor-proxima-ao-fundo", pageNumber, block,
          "A cor da fonte e muito proxima da cor de fundo, reduzindo a legibilidade.", settings));
      }
      if (Number.isFinite(block.fontSize) && block.fontSize < 1) {
        findings.push(finding("fonte-menor-que-1pt", pageNumber, block,
          `O tamanho da fonte e ${block.fontSize.toFixed(2)} pt, menor que 1 pt.`, settings));
      }
      if (blockBox && mediaBox && (
        blockBox.x < mediaBox.x - settings.boundsTolerance ||
        blockBox.y < mediaBox.y - settings.boundsTolerance ||
        blockBox.x + blockBox.width > mediaBox.x + mediaBox.width + settings.boundsTolerance ||
        blockBox.y + blockBox.height > mediaBox.y + mediaBox.height + settings.boundsTolerance
      )) {
        findings.push(finding("fora-da-mediabox", pageNumber, block,
          "O bloco de texto ultrapassa os limites visiveis da MediaBox da pagina.", settings));
      }

      if (!blockBox || blockBox.width <= 0 || blockBox.height <= 0) return;
      const covered = elements.find((element) => {
        const elementBox = boxOf(element);
        if (!elementBox || element.opacity === 0 || element.hidden) return false;
        const isDrawnOverText = element.coversText === true ||
          (["rect", "path", "image", "shape"].includes(element.type) && (element.zIndex ?? Infinity) > (block.zIndex ?? blockIndex));
        return isDrawnOverText && intersectionArea(blockBox, elementBox) / (blockBox.width * blockBox.height) >= settings.minimumCoverRatio;
      });
      if (covered) {
        findings.push(finding("texto-coberto", pageNumber, block,
          "Um elemento opaco sobrepoe a maior parte da area deste texto.", settings));
      }
    });
  });

  return findings;
}

export const detectInvisibleText = detectVisualAnomalies;
