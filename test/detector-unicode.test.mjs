import test from "node:test";
import assert from "node:assert/strict";
import { detectUnicodeAnomalies } from "../detector-unicode.js";

const scan = (text) => detectUnicodeAnomalies([{ pageNumber: 3, text }]);
const encodeTags = (ascii) => Array.from(ascii, (character) => String.fromCodePoint(0xE0000 + character.codePointAt(0))).join("") + String.fromCodePoint(0xE007F);

test("detecta caracteres de largura zero", () => {
  assert.equal(scan("antes\u200Bdepois")[0].categoria, "caractere-largura-zero");
});

test("decodifica uma sequencia Unicode Tags", () => {
  const result = scan(`visivel${encodeTags("IGNORE")}`);
  const tagFinding = result.find((item) => item.categoria === "unicode-tags");
  assert.match(tagFinding.explicacao, /IGNORE/);
  assert.equal(tagFinding.pagina, 3);
});

test("detecta controle bidirecional", () => {
  const result = scan("relatorio\u202Ecodificado");
  assert.equal(result[0].categoria, "controle-bidirecional");
});

test("detecta cinco invisiveis consecutivos", () => {
  const result = scan(`a${"\u200B".repeat(5)}b`);
  assert.ok(result.some((item) => item.categoria === "sequencia-invisivel-longa"));
});
