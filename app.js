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
const processingPanel = document.querySelector("#processing-panel");
const progressTrack = document.querySelector("#progress-track");
const progressBar = document.querySelector("#progress-bar");
const progressPercent = document.querySelector("#progress-percent");
const processingSteps = document.querySelectorAll(".processing-steps li");

const MAX_FILE_SIZE = 20 * 1024 * 1024;
let isProcessing = false;

function toRgbColor(red, green, blue) {
  const asByte = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  return [asByte(red), asByte(green), asByte(blue)];
}

function decodeUtf16Be(hex) {
  const units = String(hex).match(/[\da-f]{4}/gi) || [];
  return String.fromCharCode(...units.map((unit) => Number.parseInt(unit, 16)));
}

function isSuspiciousInvisible(character) {
  const codePoint = character.codePointAt(0);
  return [0x200B, 0x200C, 0x200D, 0xFEFF].includes(codePoint) ||
    (codePoint >= 0xE0000 && codePoint <= 0xE007F) ||
    [0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069].includes(codePoint);
}

// pdf.js normaliza alguns controles invisíveis ao extrair o texto. Preservamos
// apenas esses controles dos mapas ToUnicode do próprio PDF para os detectores.
function extractInvisibleUnicodeFromCmaps(data) {
  const source = new TextDecoder("latin1").decode(data);
  const cmaps = source.match(/begincmap[\s\S]*?endcmap/g) || [];
  const mappedText = cmaps.flatMap((cmap) => Array.from(cmap.matchAll(/<[\da-f]+>\s*<([\da-f]{4,})>/gi), (match) => decodeUtf16Be(match[1])))
    .join("");
  return Array.from(mappedText)
    .filter(isSuspiciousInvisible)
    .join("");
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
export async function extractPdfData(file, onProgress = () => {}) {
  if (!(file instanceof File) || file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecione um arquivo PDF válido.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress(pageNumber - 1, document.numPages);
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
    onProgress(pageNumber, document.numPages);
  }

  const invisibleUnicode = extractInvisibleUnicodeFromCmaps(data);
  if (invisibleUnicode && pages[0]) pages[0].text += invisibleUnicode;

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

function setProgress(step, percent, message) {
  processingPanel.hidden = false;
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", String(percent));
  uploadStatus.textContent = message;
  const currentIndex = ["extracting", "detecting", "reporting"].indexOf(step);
  processingSteps.forEach((item, index) => {
    item.classList.toggle("is-active", index === currentIndex);
    item.classList.toggle("is-complete", index < currentIndex);
  });
}

function validateFile(file) {
  if (!file) throw new Error("Escolha um arquivo para analisar.");
  const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
  if (file.type !== "application/pdf" && !hasPdfExtension) {
    throw new Error("Este arquivo não parece ser um PDF. Selecione um arquivo .pdf válido.");
  }
  if (file.size === 0) throw new Error("O arquivo PDF está vazio.");
  if (file.size > MAX_FILE_SIZE) throw new Error("O arquivo excede o limite de 20 MB. Escolha um PDF menor.");
}

function friendlyExtractionError(error) {
  const message = error instanceof Error ? error.message : "";
  if (/password|encrypted/i.test(message)) return "Este PDF é protegido por senha e não pode ser analisado.";
  if (/Invalid PDF|FormatError|UnexpectedResponseException/i.test(message)) return "Não foi possível abrir este arquivo como PDF. Verifique se ele está íntegro.";
  return "Não foi possível extrair os dados deste PDF. Tente outro arquivo ou uma versão não corrompida.";
}

async function processFile(file) {
  if (isProcessing) return;
  try {
    validateFile(file);
  } catch (error) {
    uploadStatus.textContent = error.message;
    return;
  }

  isProcessing = true;
  fileButton.disabled = true;
  dropZone.classList.add("is-processing");
  setProgress("extracting", 8, `Extraindo texto de ${file.name}…`);
  try {
    const pages = await extractPdfData(file, (completed, total) => {
      const percent = total ? Math.round(8 + (completed / total) * 47) : 55;
      setProgress("extracting", percent, `Extraindo texto — página ${completed} de ${total}`);
    });
    setProgress("detecting", 62, "Rodando detectores de conteúdo e estrutura…");
    const pdfBytes = await file.arrayBuffer();
    const report = await runAllDetectors({ pages, pdfBytes });
    setProgress("reporting", 88, "Gerando relatório…");
    renderRiskReport(file, pages, report);
    setProgress("reporting", 100, "Relatório concluído.");
    await new Promise((resolve) => setTimeout(resolve, 180));
    uploadScreen.hidden = true;
    reportScreen.hidden = false;
  } catch (error) {
    processingPanel.hidden = true;
    uploadStatus.textContent = friendlyExtractionError(error);
  } finally {
    isProcessing = false;
    fileButton.disabled = false;
    dropZone.classList.remove("is-processing");
  }
}

async function handleFile(file) {
  return processFile(file);
}

fileButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!isProcessing) fileInput.click();
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
dropZone.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && !isProcessing) {
    event.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener("click", () => {
  if (!isProcessing) fileInput.click();
});
["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  if (!isProcessing) dropZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
}));
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!isProcessing && file) handleFile(file);
});
newFileButton.addEventListener("click", () => {
  reportScreen.hidden = true;
  uploadScreen.hidden = false;
  fileInput.value = "";
  uploadStatus.textContent = "";
});

newFileButton.addEventListener("click", () => {
  processingPanel.hidden = true;
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressTrack.setAttribute("aria-valuenow", "0");
  processingSteps.forEach((item) => item.classList.remove("is-active", "is-complete"));
});
