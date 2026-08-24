import test from "node:test";
import assert from "node:assert/strict";
import { detectVisualAnomalies } from "../detector-visual.js";

const page = (blocks, elements = []) => [{
  pageNumber: 7,
  width: 612,
  height: 792,
  backgroundColor: "#ffffff",
  blocks,
  elements
}];

const block = (overrides = {}) => ({
  text: "instrucao suspeita que deveria estar invisivel",
  position: { x: 100, y: 100, width: 120, height: 12 },
  fontSize: 12,
  ...overrides
});

test("sinaliza fonte semelhante ao fundo", () => {
  const result = detectVisualAnomalies(page([block({ color: "#fefefe" })]));
  assert.equal(result[0].categoria, "cor-proxima-ao-fundo");
  assert.equal(result[0].pagina, 7);
});

test("sinaliza fonte menor que 1pt", () => {
  const result = detectVisualAnomalies(page([block({ fontSize: 0.5 })]));
  assert.equal(result[0].categoria, "fonte-menor-que-1pt");
});

test("sinaliza texto fora da MediaBox", () => {
  const result = detectVisualAnomalies(page([block({ position: { x: 605, y: 100, width: 20, height: 12 } })]));
  assert.equal(result[0].categoria, "fora-da-mediabox");
});

test("sinaliza texto coberto por elemento posterior", () => {
  const result = detectVisualAnomalies(page([block({ zIndex: 1 })], [{
    type: "rect",
    zIndex: 2,
    opacity: 1,
    position: { x: 98, y: 98, width: 125, height: 16 }
  }]));
  assert.equal(result[0].categoria, "texto-coberto");
});

test("limita o trecho retornado", () => {
  const result = detectVisualAnomalies(page([block({ text: "x".repeat(250), fontSize: 0.1 })]));
  assert.equal(result[0].trecho.length, 200);
});
