import { detectVisualAnomalies } from "./detector-visual.js";
import { detectUnicodeAnomalies } from "./detector-unicode.js";
import { detectPhraseAnomalies, loadSuspiciousPhrases } from "./detector-frases.js";
import { detectMetadataAnomalies } from "./detector-metadados.js";

const RISK_POLICY = {
  "cor-proxima-ao-fundo": { severity: "medio", weight: 12 },
  "fonte-menor-que-1pt": { severity: "medio", weight: 12 },
  "fora-da-mediabox": { severity: "medio", weight: 12 },
  "texto-coberto": { severity: "alto", weight: 25 },
  "caractere-largura-zero": { severity: "baixo", weight: 4 },
  "unicode-tags": { severity: "alto", weight: 25 },
  "controle-bidirecional": { severity: "alto", weight: 25 },
  "sequencia-invisivel-longa": { severity: "medio", weight: 12 },
  "frase-suspeita": { severity: "alto", weight: 25 },
  "javascript-embutido": { severity: "alto", weight: 25 },
  "anotacao-ou-campo-oculto": { severity: "alto", weight: 25 },
  "texto-alternativo-de-imagem": { severity: "medio", weight: 12 }
};

const DEFAULT_POLICY = { severity: "baixo", weight: 4 };

export function consolidateFindings(findings) {
  const annotated = findings.map((finding) => ({ ...finding, ...(RISK_POLICY[finding.categoria] || DEFAULT_POLICY) }));
  const totalWeight = annotated.reduce((total, finding) => total + finding.weight, 0);
  const score = Math.min(100, totalWeight);
  const summary = { alto: 0, medio: 0, baixo: 0 };
  const grouped = new Map();
  annotated.forEach((finding) => {
    summary[finding.severity] += 1;
    const category = grouped.get(finding.categoria) || [];
    category.push(finding);
    grouped.set(finding.categoria, category);
  });
  return {
    score,
    riskLevel: score >= 60 ? "alto" : score >= 25 ? "medio" : "baixo",
    summary,
    findings: annotated,
    groups: Array.from(grouped, ([categoria, items]) => ({ categoria, items }))
  };
}

/** Runs every available detector over extracted PDF pages and raw PDF bytes. */
export async function runAllDetectors({ pages, pdfBytes, phrasePatterns, fetchImplementation } = {}) {
  if (!Array.isArray(pages)) throw new TypeError("pages deve ser o resultado da extracao do PDF.");
  const patterns = phrasePatterns || await loadSuspiciousPhrases(fetchImplementation);
  const findings = [
    ...detectVisualAnomalies(pages),
    ...detectUnicodeAnomalies(pages),
    ...detectPhraseAnomalies(pages, patterns),
    ...(pdfBytes ? detectMetadataAnomalies(pdfBytes) : [])
  ];
  return consolidateFindings(findings);
}

export { RISK_POLICY };
