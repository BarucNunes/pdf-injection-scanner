/** Detector de caracteres Unicode invisiveis ou usados para ofuscacao. */

const ZERO_WIDTH = new Set([0x200B, 0x200C, 0x200D, 0xFEFF]);
const BIDI_CONTROLS = new Set([
  0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069
]);
const TAG_START = 0xE0000;
const TAG_END = 0xE007F;
const TAG_CANCEL = 0xE007F;
const DEFAULT_SNIPPET_LENGTH = 200;

function snippet(value, maxLength = DEFAULT_SNIPPET_LENGTH) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function codePointLabel(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(codePoint > 0xFFFF ? 6 : 4, "0")}`;
}

function visibleContext(text, index, length) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 80);
  const context = text.slice(start, end);
  return snippet(context.replace(/[\u200B\u200C\u200D\uFEFF\u{E0000}-\u{E007F}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "[invisivel]"));
}

function finding(categoria, pagina, trecho, explicacao) {
  return { categoria, pagina, trecho: snippet(trecho), explicacao };
}

function decodeTagRun(characters) {
  let decoded = "";
  for (const character of characters) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xE0020 && codePoint <= 0xE007E) decoded += String.fromCharCode(codePoint - 0xE0000);
  }
  return decoded;
}

/**
 * Varre o texto agregado de cada pagina. `pages` e o retorno de extractPdfData().
 * @param {Array<{pageNumber?: number, text?: string, blocks?: Array<{text?: string}>}>} pages
 * @returns {Array<{categoria: string, pagina: number, trecho: string, explicacao: string}>}
 */
export function detectUnicodeAnomalies(pages) {
  if (!Array.isArray(pages)) throw new TypeError("pages deve ser um array de paginas extraidas.");
  const findings = [];

  pages.forEach((page, pageIndex) => {
    const pageNumber = page.pageNumber ?? pageIndex + 1;
    const text = typeof page.text === "string" ? page.text : (page.blocks || []).map((block) => block.text || "").join("");
    const characters = Array.from(text);

    for (let index = 0; index < characters.length; index += 1) {
      const codePoint = characters[index].codePointAt(0);
      if (ZERO_WIDTH.has(codePoint)) {
        findings.push(finding("caractere-largura-zero", pageNumber, visibleContext(text, [...characters.slice(0, index)].join("").length, characters[index].length),
          `Foi encontrado ${codePointLabel(codePoint)}, um caractere de largura zero.`));
      }
      if (BIDI_CONTROLS.has(codePoint)) {
        findings.push(finding("controle-bidirecional", pageNumber, visibleContext(text, [...characters.slice(0, index)].join("").length, characters[index].length),
          `Foi encontrado ${codePointLabel(codePoint)}, um controle bidirecional que pode alterar a ordem visual do texto.`));
      }
    }

    let runStart = -1;
    for (let index = 0; index <= characters.length; index += 1) {
      const codePoint = index < characters.length ? characters[index].codePointAt(0) : -1;
      if (codePoint >= TAG_START && codePoint <= TAG_END) {
        if (runStart === -1) runStart = index;
      } else if (runStart !== -1) {
        const run = characters.slice(runStart, index);
        const decoded = decodeTagRun(run);
        const sourceIndex = characters.slice(0, runStart).join("").length;
        findings.push(finding("unicode-tags", pageNumber, visibleContext(text, sourceIndex, run.join("").length),
          `Foram encontrados ${run.length} caracteres Unicode Tags invisiveis.${decoded ? ` Texto ASCII decodificado: "${decoded}".` : ""}`));
        runStart = -1;
      }
    }

    let invisibleRunStart = -1;
    for (let index = 0; index <= characters.length; index += 1) {
      const codePoint = index < characters.length ? characters[index].codePointAt(0) : -1;
      const invisible = ZERO_WIDTH.has(codePoint) || (codePoint >= TAG_START && codePoint <= TAG_END) || BIDI_CONTROLS.has(codePoint);
      if (invisible && invisibleRunStart === -1) invisibleRunStart = index;
      if (!invisible && invisibleRunStart !== -1) {
        const length = index - invisibleRunStart;
        if (length >= 5) {
          const sourceIndex = characters.slice(0, invisibleRunStart).join("").length;
          findings.push(finding("sequencia-invisivel-longa", pageNumber, visibleContext(text, sourceIndex, characters.slice(invisibleRunStart, index).join("").length),
            `Ha uma sequencia de ${length} caracteres invisiveis consecutivos, possivelmente texto codificado.`));
        }
        invisibleRunStart = -1;
      }
    }
  });
  return findings;
}

export const detectHiddenUnicode = detectUnicodeAnomalies;
