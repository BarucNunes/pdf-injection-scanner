const CONFIG_URL = new URL("./config/frases-suspeitas.json", import.meta.url);

function normalise(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function tokenize(value) {
  const source = String(value || "");
  return Array.from(source.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    value: normalise(match[0]),
    start: match.index,
    end: match.index + match[0].length
  }));
}

function words(value) {
  return tokenize(value).map((token) => token.value);
}

function distance(first, second) {
  if (Math.abs(first.length - second.length) > 1) return 2;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= second.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[second.length];
}

function similar(actual, expected) {
  return actual === expected || (expected.length >= 5 && distance(actual, expected) <= 1);
}

function findPattern(text, pattern) {
  const target = words(pattern);
  const source = tokenize(text);
  if (!target.length) return false;
  for (let start = 0; start <= source.length - target.length; start += 1) {
    let sourceIndex = start;
    let targetIndex = 0;
    let skipped = 0;
    while (sourceIndex < source.length && targetIndex < target.length && skipped <= 1) {
      if (similar(source[sourceIndex].value, target[targetIndex])) {
        sourceIndex += 1;
        targetIndex += 1;
      } else {
        sourceIndex += 1;
        skipped += 1;
      }
    }
    if (targetIndex === target.length) return {
      text: String(text).slice(source[start].start, source[sourceIndex - 1].end),
      start: source[start].start
    };
  }
  return false;
}

function context(text, matched) {
  const value = String(text).slice(Math.max(0, matched.start - 80), matched.start + matched.text.length + 120).replace(/\s+/g, " ").trim();
  return value.length > 200 ? `${value.slice(0, 199)}…` : value;
}

/** Loads the editavel JSON list. */
export async function loadSuspiciousPhrases(fetchImplementation = fetch) {
  const response = await fetchImplementation(CONFIG_URL);
  if (!response.ok) throw new Error("Nao foi possivel carregar config/frases-suspeitas.json.");
  const config = await response.json();
  if (!Array.isArray(config)) throw new TypeError("A configuracao de frases deve ser um array.");
  return config;
}

/** @returns {Array<{categoria: string, pagina: number, trecho: string, explicacao: string}>} */
export function detectPhraseAnomalies(pages, patterns) {
  if (!Array.isArray(pages)) throw new TypeError("pages deve ser um array de paginas extraidas.");
  if (!Array.isArray(patterns)) throw new TypeError("patterns deve ser a lista carregada de frases suspeitas.");
  const findings = [];
  pages.forEach((page, pageIndex) => {
    const text = typeof page.text === "string" ? page.text : (page.blocks || []).map((block) => block.text || "").join("");
    patterns.forEach((entry) => {
      const pattern = typeof entry === "string" ? entry : entry.padrao;
      const matched = findPattern(text, pattern);
      if (!matched) return;
      findings.push({
        categoria: "frase-suspeita",
        pagina: page.pageNumber ?? pageIndex + 1,
        trecho: context(text, matched),
        explicacao: `Corresponde ao padrao suspeito "${pattern}"${entry.id ? ` (${entry.id})` : ""}.`
      });
    });
  });
  return findings;
}

export async function detectPhraseAnomaliesFromConfig(pages, fetchImplementation = fetch) {
  return detectPhraseAnomalies(pages, await loadSuspiciousPhrases(fetchImplementation));
}
