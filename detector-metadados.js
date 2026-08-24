function toText(pdfBytes) {
  if (typeof pdfBytes === "string") return pdfBytes;
  if (pdfBytes instanceof ArrayBuffer) return new TextDecoder("latin1").decode(new Uint8Array(pdfBytes));
  if (ArrayBuffer.isView(pdfBytes)) return new TextDecoder("latin1").decode(pdfBytes);
  throw new TypeError("pdfBytes deve ser uma string, ArrayBuffer ou Uint8Array.");
}

function decodePdfLiteral(value) {
  return value.replace(/\\([()\\])/g, "$1").replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\\d{1,3}/g, "?");
}

function excerpt(value) {
  const text = decodePdfLiteral(String(value || "")).replace(/\s+/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function objectRecords(pdfText) {
  const records = [];
  const matcher = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
  let match;
  let pageNumber = 0;
  while ((match = matcher.exec(pdfText))) {
    if (/\/Type\s*\/Page\b/.test(match[3])) pageNumber += 1;
    records.push({ body: match[3], page: /\/Type\s*\/Page\b/.test(match[3]) ? pageNumber : null });
  }
  return records;
}

function valueAfterKey(body, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const literal = new RegExp(`/${escaped}\\s*\\(([^)]{0,500})\\)`).exec(body);
  if (literal) return literal[1];
  const hex = new RegExp(`/${escaped}\\s*<([0-9a-fA-F]{2,400})>`).exec(body);
  return hex ? hex[1].replace(/(..)/g, (_, pair) => String.fromCharCode(Number.parseInt(pair, 16))) : "";
}

/**
 * Inspeciona a sintaxe do PDF. `pagina` fica null quando o objeto nao pode
 * ser associado de forma confiavel a uma pagina sem resolver referencias PDF.
 */
export function detectMetadataAnomalies(pdfBytes) {
  const pdfText = toText(pdfBytes);
  const findings = [];
  const seen = new Set();
  const add = (categoria, pagina, trecho, explicacao) => {
    const key = `${categoria}|${pagina}|${trecho}`;
    if (!seen.has(key)) findings.push({ categoria, pagina, trecho: excerpt(trecho), explicacao });
    seen.add(key);
  };

  objectRecords(pdfText).forEach(({ body, page }) => {
    if (/\/(?:JS|JavaScript)\b/.test(body)) {
      const code = valueAfterKey(body, "JS") || valueAfterKey(body, "JavaScript") || "/JS presente sem literal legivel";
      add("javascript-embutido", page, code, "O PDF contem uma acao JavaScript embutida (/JS ou /JavaScript).");
    }

    const annotationOrField = /\/Subtype\s*\/(?:Text|FreeText|Widget)\b|\/FT\s*\//.test(body);
    const flags = /\/F\s+(\d+)/.exec(body);
    const hidden = flags && (Number(flags[1]) & 3) !== 0;
    if (annotationOrField && hidden) {
      const hiddenText = ["Contents", "T", "TU", "V", "DV"].map((key) => valueAfterKey(body, key)).find(Boolean) || "texto do campo/annotacao nao legivel";
      add("anotacao-ou-campo-oculto", page, hiddenText, "Uma anotacao ou campo de formulario possui flag Invisible/Hidden e contem texto ou metadados.");
    }

    if ((/\/Subtype\s*\/Image\b/.test(body) || /\/S\s*\/Figure\b/.test(body)) && /\/(?:Alt|ActualText)\s*(?:\(|<)/.test(body)) {
      const alternative = valueAfterKey(body, "Alt") || valueAfterKey(body, "ActualText");
      if (alternative) add("texto-alternativo-de-imagem", page, alternative, "Uma imagem possui texto alternativo que pode conter instrucoes nao visiveis.");
    }
  });
  return findings;
}

export const detectPdfMetadata = detectMetadataAnomalies;
