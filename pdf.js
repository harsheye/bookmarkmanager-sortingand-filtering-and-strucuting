// pdf.js - Logic for PDF merges and compression using pdf-lib

const mergeDropzone = document.getElementById("merge-dropzone");
const mergeFileInput = document.getElementById("merge-file-input");
const mergeFileList = document.getElementById("merge-file-list");
const btnMergeRun = document.getElementById("btn-merge-run");

const compressDropzone = document.getElementById("compress-dropzone");
const compressFileInput = document.getElementById("compress-file-input");
const compressFileList = document.getElementById("compress-file-list");
const btnCompressRun = document.getElementById("btn-compress-run");

let mergeFiles = [];
let compressFile = null;

// Tab switcher
window.switchTab = function(mode) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

  if (mode === 'merge') {
    document.querySelector(".tab-btn:nth-child(1)").classList.add("active");
    document.getElementById("tab-merge").classList.add("active");
  } else {
    document.querySelector(".tab-btn:nth-child(2)").classList.add("active");
    document.getElementById("tab-compress").classList.add("active");
  }
};

// Bind file uploads
setupDragAndDrop(mergeDropzone, mergeFileInput, (files) => {
  mergeFiles = [...mergeFiles, ...Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"))];
  renderMergeFiles();
});

setupDragAndDrop(compressDropzone, compressFileInput, (files) => {
  const filtered = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
  if (filtered.length > 0) {
    compressFile = filtered[0];
    renderCompressFile();
  }
});

function setupDragAndDrop(dropzone, input, callback) {
  dropzone.addEventListener("click", () => input.click());
  
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("active");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("active");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("active");
    if (e.dataTransfer.files.length > 0) {
      callback(e.dataTransfer.files);
    }
  });

  input.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      callback(e.target.files);
    }
  });
}

// Render logic
function renderMergeFiles() {
  mergeFileList.innerHTML = mergeFiles.map((f, index) => `
    <div class="file-row">
      <span>📄 ${f.name} <span class="file-size">(${(f.size / 1024 / 1024).toFixed(2)} MB)</span></span>
      <span style="color:#ef4444; cursor:pointer; font-weight:bold;" onclick="removeMergeFile(${index})">✕</span>
    </div>
  `).join("");

  btnMergeRun.style.display = mergeFiles.length > 0 ? "block" : "none";
}

window.removeMergeFile = function(index) {
  mergeFiles.splice(index, 1);
  renderMergeFiles();
};

function renderCompressFile() {
  compressFileList.innerHTML = compressFile ? `
    <div class="file-row">
      <span>📄 ${compressFile.name} <span class="file-size">(${(compressFile.size / 1024 / 1024).toFixed(2)} MB)</span></span>
      <span style="color:#ef4444; cursor:pointer; font-weight:bold;" onclick="removeCompressFile()">✕</span>
    </div>
  ` : "";

  btnCompressRun.style.display = compressFile ? "block" : "none";
}

window.removeCompressFile = function() {
  compressFile = null;
  renderCompressFile();
};

// Execute Merge
btnMergeRun.addEventListener("click", async () => {
  if (mergeFiles.length === 0) return;
  btnMergeRun.textContent = "Merging Documents...";
  btnMergeRun.disabled = true;

  try {
    const { PDFDocument } = window.PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const file of mergeFiles) {
      const buffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(buffer);
      const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    }

    const mergedBytes = await mergedPdf.save();
    downloadPdf(mergedBytes, "merged_document.pdf");
    
    btnMergeRun.textContent = "Merge PDF Files";
    btnMergeRun.disabled = false;
    mergeFiles = [];
    renderMergeFiles();
  } catch(e) {
    alert("Error merging PDF documents");
    console.error(e);
    btnMergeRun.textContent = "Failed. Try again";
    btnMergeRun.disabled = false;
  }
});

// Execute Compress
btnCompressRun.addEventListener("click", async () => {
  if (!compressFile) return;
  btnCompressRun.textContent = "Compressing PDF...";
  btnCompressRun.disabled = true;

  try {
    const { PDFDocument } = window.PDFLib;
    const buffer = await compressFile.arrayBuffer();
    const doc = await PDFDocument.load(buffer);
    const compressedBytes = await doc.save({ useObjectStreams: true });
    
    downloadPdf(compressedBytes, "compressed_document.pdf");
    
    btnCompressRun.textContent = "Compress PDF File";
    btnCompressRun.disabled = false;
    compressFile = null;
    renderCompressFile();
  } catch(e) {
    alert("Error compressing PDF file");
    console.error(e);
    btnCompressRun.textContent = "Failed. Try again";
    btnCompressRun.disabled = false;
  }
});

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
