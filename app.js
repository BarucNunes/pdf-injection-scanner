import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
import { runAllDetectors } from "./motor-analise.js";

const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const uploadScreen = document.querySelector("#upload-screen");
const reportScreen = document.querySelector("#report-screen");
const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const fileButton = document.querySelector("#file-button");
const newFileButton = document.querySelector("#new-file-button");
const uploadStatus = document.querySelector("#upload-status");
const summary = document.querySelector("#document-summary");
const pagesReport = document.querySelector("#pages-report");

function toRgbColor(red, green, blue) {
  const asByte = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  return [asByte(red), asByte(green), asByte(blue)];
}

async function extractVisualMetadata(page, viewport) {
  const operatorList = await page.getOperatorList();
  const textAppearances = [];
  const elements = [];
  let fillColor = [0, 0, 0];
  const ops = pdfjsLib.OPS;
  operatorList.fnArray.forEach((operation, index) => {
    const args = operatorList.argsArray[index] || [];
    if (operation === ops.setFillRGBColor) fillColor = toRgbColor(args[0], args[1], args[2]);
    if (operation === ops.setFillGray) fillColor = toRgbColor(args[0], args[0], args[0]);
    if (operation === ops.showText || operation === ops.showSpacedText) textAppearances.push({ color: fillColor, zIndex: index });
    if (operation !== ops.constructPath) return;
    const pathOperations = args[0] || [];
    const pathArguments = args[1] || [];
    let argumentIndex = 0;
    pathOperations.forEach((pathOperation) => {
      if (pathOperation !== ops.rectangle) return;
      const [x, y, width, height] = pathArguments.slice(argumentIndex, argumentIndex + 4);
      argumentIndex += 4;
      if ([x, y, width, height].every(Number.isFinite)) elements.push({
        type: "rect", zIndex: index, opacity: 1, color: fillColor,
        position: { x, y: viewport.height - y - height, width, height }
      });
    });
  });
  return { textAppearances, elements };
}

/**
 * Extracts the raw text layout from every page without running detectors.
 * @param {File} file
 * @returns {Promise<Array<{pageNumber: number, width: number, height: number, text: string, blocks: Array}>>}
 */
export async function extractPdfData(file) {
  if (!(file instanceof File) || file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecione um arquivo PDF válido.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const [textContent, visualMetadata] = await Promise.all([page.getTextContent(), extractVisualMetadata(page, viewport)]);
    const blocks = textContent.items
      .filter((item) => typeof item.str === "string" && item.str.length > 0)
      .map((item, index) => {
        const [, , , , x, y] = item.transform;
        const fontSize = Math.sqrt((item.transform[0] ** 2) + (item.transform[1] ** 2));
        return {
          text: item.str,
          position: { x, y: viewport.height - y - item.height, width: item.width, height: item.height },
          fontSize,
          fontName: item.fontName || null,
          color: visualMetadata.textAppearances[index]?.color || null,
          zIndex: visualMetadata.textAppearances[index]?.zIndex ?? index
        };
      });

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      mediaBox: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      backgroundColor: [255, 255, 255],
      text: blocks.map((block) => block.text).join(""),
      blocks,
      elements: visualMetadata.elements
    });
  }

  return pages;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function renderReport(file, pages, findings = []) {
  const blockCount = pages.reduce((total, page) => total + page.blocks.length, 0);
  summary.innerHTML = `
    <div class="stat"><span class="stat-label">Arquivo</span><span class="stat-value" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span></div>
    <div class="stat"><span class="stat-label">Páginas</span><span class="stat-value">${pages.length}</span></div>
    <div class="stat"><span class="stat-label">Blocos de texto</span><span class="stat-value">${blockCount}</span></div>
  `;
  pagesReport.innerHTML = pages.map((page) => `
    <article class="page-card">
      <h2 class="page-title">Página ${page.pageNumber}</h2>
      <div class="page-meta">${page.width.toFixed(1)} × ${page.height.toFixed(1)} pt · ${page.text.length} caracteres</div>
      ${page.blocks.length ? `<ul class="text-blocks">${page.blocks.map((block) => `
        <li class="text-block">
          <span class="block-text">${escapeHtml(block.text)}</span>
          <span class="block-details">x ${block.position.x.toFixed(1)} · y ${block.position.y.toFixed(1)} · fonte ${block.fontSize.toFixed(1)} pt · cor não disponível</span>
        </li>`).join("")}</ul>` : '<p class="empty-page">Nenhum texto extraível nesta página.</p>'}
      ${findings.filter((finding) => finding.pagina === page.pageNumber).map((finding) => `<p class="empty-page"><strong>${escapeHtml(finding.categoria)}</strong>: ${escapeHtml(finding.explicacao)}<br>${escapeHtml(finding.trecho)}</p>`).join("")}
    </article>
  `).join("");
}

function displayCategory(category) {
  return category.replace(/-/g, " ");
}

function renderRiskReport(file, pages, report) {
  summary.innerHTML = `
    <div class="risk-card risk-${report.riskLevel}"><span class="stat-label">Score de risco</span><span class="risk-score">${report.score}<small>/100</small></span><span class="risk-label">Risco ${report.riskLevel}</span></div>
    <div class="stat"><span class="stat-label">Arquivo</span><span class="stat-value" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span></div>
    <div class="stat"><span class="stat-label">Paginas</span><span class="stat-value">${pages.length}</span></div>
    <div class="stat"><span class="stat-label">Achados</span><span class="stat-value">${report.findings.length}</span></div>
    <div class="stat"><span class="stat-label">Severidade</span><span class="severity-summary"><b class="severity-alto">${report.summary.alto} alto</b><b class="severity-medio">${report.summary.medio} medio</b><b class="severity-baixo">${report.summary.baixo} baixo</b></span></div>
  `;
  pagesReport.innerHTML = `
    <p class="heuristic-notice">Esta analise e uma triagem heuristica, nao uma certeza absoluta. Revise cada achado no contexto do documento: falsos positivos sao possiveis.</p>
    ${report.groups.length ? report.groups.map((group) => `
      <article class="page-card finding-group">
        <h2 class="page-title">${escapeHtml(displayCategory(group.categoria))} <span>${group.items.length}</span></h2>
        <ul class="findings-list">${group.items.map((finding) => `
          <li class="finding severity-${finding.severity}">
            <div class="finding-top"><b>${escapeHtml(finding.severity)}</b><span>${finding.pagina ? `Pagina ${finding.pagina}` : "Estrutura do PDF"}</span></div>
            <p>${escapeHtml(finding.explicacao)}</p>
            <code>${escapeHtml(finding.trecho || "Sem trecho legivel")}</code>
          </li>`).join("")}</ul>
      </article>`).join("") : '<article class="page-card"><p class="empty-page">Nenhum sinal foi encontrado pelos detectores atuais.</p></article>'}
  `;
}

async function handleFile(file) {
  uploadStatus.textContent = "Extraindo dados do PDF…";
  fileButton.disabled = true;
  try {
    const pages = await extractPdfData(file);
    const pdfBytes = await file.arrayBuffer();
    const report = await runAllDetectors({ pages, pdfBytes });
    renderRiskReport(file, pages, report);
    uploadScreen.hidden = true;
    reportScreen.hidden = false;
  } catch (error) {
    uploadStatus.textContent = error instanceof Error ? error.message : "Não foi possível ler o PDF.";
  } finally {
    fileButton.disabled = false;
  }
}

fileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") fileInput.click();
});
["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
}));
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) handleFile(file);
});
newFileButton.addEventListener("click", () => {
  reportScreen.hidden = true;
  uploadScreen.hidden = false;
  fileInput.value = "";
  uploadStatus.textContent = "";
});
