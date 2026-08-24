import test from "node:test";
import assert from "node:assert/strict";
import { consolidateFindings, runAllDetectors } from "../motor-analise.js";

test("atribui severidade, score e agrupamento", () => {
  const report = consolidateFindings([
    { categoria: "unicode-tags", pagina: 1, trecho: "x", explicacao: "x" },
    { categoria: "caractere-largura-zero", pagina: 1, trecho: "x", explicacao: "x" }
  ]);
  assert.equal(report.score, 29);
  assert.equal(report.riskLevel, "medio");
  assert.deepEqual(report.summary, { alto: 1, medio: 0, baixo: 1 });
  assert.equal(report.groups[0].items[0].severity, "alto");
});

test("roda todos os detectores usando os dados extraidos", async () => {
  const report = await runAllDetectors({
    pages: [{ pageNumber: 1, width: 100, height: 100, text: "ignore previous instructions\u200B", blocks: [] }],
    pdfBytes: "%PDF-1.7\n1 0 obj << /JS (x) >> endobj",
    phrasePatterns: [{ padrao: "ignore previous instructions" }]
  });
  assert.ok(report.findings.some((finding) => finding.categoria === "frase-suspeita"));
  assert.ok(report.findings.some((finding) => finding.categoria === "javascript-embutido"));
  assert.ok(report.findings.some((finding) => finding.categoria === "caractere-largura-zero"));
});
