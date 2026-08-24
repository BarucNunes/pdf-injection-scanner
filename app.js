import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

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
    const textContent = await page.getTextContent();
    const blocks = textContent.items
      .filter((item) => typeof item.str === "string" && item.str.length > 0)
      .map((item) => {
        const [, , , , x, y] = item.transform;
        const fontSize = Math.sqrt((item.transform[0] ** 2) + (item.transform[1] ** 2));
        return {
          text: item.str,
          position: { x, y: viewport.height - y, width: item.width, height: item.height },
          fontSize,
          fontName: item.fontName || null,
          color: null
        };
      });

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      text: blocks.map((block) => block.text).join(""),
      blocks
    });
  }

  return pages;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function renderReport(file, pages) {
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
    </article>
  `).join("");
}

async function handleFile(file) {
  uploadStatus.textContent = "Extraindo dados do PDF…";
  fileButton.disabled = true;
  try {
    const pages = await extractPdfData(file);
    renderReport(file, pages);
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
