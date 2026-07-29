// pdf.js - Logic for PDF merges, compression, splitting, and rotation using pdf-lib

// Merge elements
const mergeDropzone = document.getElementById("merge-dropzone");
const mergeFileInput = document.getElementById("merge-file-input");
const mergeFileList = document.getElementById("merge-file-list");
const btnMergeRun = document.getElementById("btn-merge-run");

// Image elements
const imageDropzone = document.getElementById("image-dropzone");
const imageFileInput = document.getElementById("image-file-input");
const imageFileList = document.getElementById("image-file-list");
const btnImageRun = document.getElementById("btn-image-run");

// Compress elements
const compressDropzone = document.getElementById("compress-dropzone");
const compressFileInput = document.getElementById("compress-file-input");
const compressFileList = document.getElementById("compress-file-list");
const btnCompressRun = document.getElementById("btn-compress-run");

// Split elements
const splitDropzone = document.getElementById("split-dropzone");
const splitFileInput = document.getElementById("split-file-input");
const splitFileList = document.getElementById("split-file-list");
const splitControls = document.getElementById("split-controls");
const splitRangesInput = document.getElementById("split-ranges");
const btnSplitRun = document.getElementById("btn-split-run");

// Rotate elements
const rotateDropzone = document.getElementById("rotate-dropzone");
const rotateFileInput = document.getElementById("rotate-file-input");
const rotateFileList = document.getElementById("rotate-file-list");
const rotateControls = document.getElementById("rotate-controls");
const rotateAngleSelect = document.getElementById("rotate-angle");
const btnRotateRun = document.getElementById("btn-rotate-run");

// Notification element
const toastNotify = document.getElementById("toast-notify");

let mergeFiles = [];
let imageFiles = [];
let compressFile = null;
let splitFile = null;
let rotateFile = null;

// Tab switcher
window.switchTab = function(mode) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

  if (mode === 'merge') {
    document.getElementById("btn-tab-merge").classList.add("active");
    document.getElementById("tab-merge").classList.add("active");
  } else if (mode === 'image') {
    document.getElementById("btn-tab-image").classList.add("active");
    document.getElementById("tab-image").classList.add("active");
  } else if (mode === 'compress') {
    document.getElementById("btn-tab-compress").classList.add("active");
    document.getElementById("tab-compress").classList.add("active");
  } else if (mode === 'split') {
    document.getElementById("btn-tab-split").classList.add("active");
    document.getElementById("tab-split").classList.add("active");
  } else if (mode === 'rotate') {
    document.getElementById("btn-tab-rotate").classList.add("active");
    document.getElementById("tab-rotate").classList.add("active");
  }
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode) {
      window.switchTab(btn.dataset.mode);
    }
  });
});

// Bind file uploads
setupDragAndDrop(mergeDropzone, mergeFileInput, (files) => {
  mergeFiles = [...mergeFiles, ...Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"))];
  renderMergeFiles();
});

setupDragAndDrop(imageDropzone, imageFileInput, (files) => {
  imageFiles = [...imageFiles, ...Array.from(files).filter(f => f.type === "image/png" || f.type === "image/jpeg" || f.name.match(/\.(png|jpe?g)$/i))];
  renderImageFiles();
});

setupDragAndDrop(compressDropzone, compressFileInput, (files) => {
  const filtered = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
  if (filtered.length > 0) {
    compressFile = filtered[0];
    renderCompressFile();
  }
});

setupDragAndDrop(splitDropzone, splitFileInput, (files) => {
  const filtered = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
  if (filtered.length > 0) {
    splitFile = filtered[0];
    renderSplitFile();
  }
});

setupDragAndDrop(rotateDropzone, rotateFileInput, (files) => {
  const filtered = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
  if (filtered.length > 0) {
    rotateFile = filtered[0];
    renderRotateFile();
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

function showToast(message) {
  toastNotify.textContent = message;
  toastNotify.classList.add("active");
  setTimeout(() => {
    toastNotify.classList.remove("active");
  }, 3000);
}

// Render Merge Files
function renderMergeFiles() {
  if (mergeFiles.length > 0) {
    mergeFileList.innerHTML = mergeFiles.map((f, index) => `
      <div class="file-row">
        <div class="file-info">
          <span>📄</span>
          <span class="file-name">${f.name}</span>
          <span class="file-size">(${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${index > 0 ? `<button class="file-action-btn merge-up-btn" data-index="${index}" title="Move Up">↑</button>` : `<div style="width:28px"></div>`}
          ${index < mergeFiles.length - 1 ? `<button class="file-action-btn merge-down-btn" data-index="${index}" title="Move Down">↓</button>` : `<div style="width:28px"></div>`}
          <button class="file-action-btn merge-remove-btn" data-index="${index}" title="Remove">✕</button>
        </div>
      </div>
    `).join("");
    mergeDropzone.style.display = "none";
  } else {
    mergeFileList.innerHTML = "";
    mergeDropzone.style.display = "flex";
  }
  btnMergeRun.style.display = mergeFiles.length > 0 ? "block" : "none";
}

window.removeMergeFile = function(index) {
  mergeFiles.splice(index, 1);
  renderMergeFiles();
};

window.moveMergeFileUp = function(index) {
  if (index > 0) {
    const temp = mergeFiles[index];
    mergeFiles[index] = mergeFiles[index - 1];
    mergeFiles[index - 1] = temp;
    renderMergeFiles();
  }
};

window.moveMergeFileDown = function(index) {
  if (index < mergeFiles.length - 1) {
    const temp = mergeFiles[index];
    mergeFiles[index] = mergeFiles[index + 1];
    mergeFiles[index + 1] = temp;
    renderMergeFiles();
  }
};

mergeFileList.addEventListener('click', (e) => {
  if (e.target.classList.contains('merge-remove-btn')) {
    window.removeMergeFile(parseInt(e.target.dataset.index, 10));
  } else if (e.target.classList.contains('merge-up-btn')) {
    window.moveMergeFileUp(parseInt(e.target.dataset.index, 10));
  } else if (e.target.classList.contains('merge-down-btn')) {
    window.moveMergeFileDown(parseInt(e.target.dataset.index, 10));
  }
});

// Render Image Files
function renderImageFiles() {
  if (imageFiles.length > 0) {
    imageFileList.innerHTML = imageFiles.map((f, index) => `
      <div class="file-row">
        <div class="file-info">
          <span>🖼️</span>
          <span class="file-name">${f.name}</span>
          <span class="file-size">(${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <button class="file-action-btn image-remove-btn" data-index="${index}">✕</button>
      </div>
    `).join("");
    imageDropzone.style.display = "none";
  } else {
    imageFileList.innerHTML = "";
    imageDropzone.style.display = "flex";
  }
  btnImageRun.style.display = imageFiles.length > 0 ? "block" : "none";
}

window.removeImageFile = function(index) {
  imageFiles.splice(index, 1);
  renderImageFiles();
};

imageFileList.addEventListener('click', (e) => {
  if (e.target.classList.contains('image-remove-btn')) {
    window.removeImageFile(parseInt(e.target.dataset.index, 10));
  }
});

// Render Compress File
function renderCompressFile() {
  if (compressFile) {
    compressFileList.innerHTML = `
      <div class="file-row">
        <div class="file-info">
          <span>📄</span>
          <span class="file-name">${compressFile.name}</span>
          <span class="file-size">(${(compressFile.size / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <button class="file-action-btn compress-remove-btn">✕</button>
      </div>
    `;
    compressDropzone.style.display = "none";
  } else {
    compressFileList.innerHTML = "";
    compressDropzone.style.display = "flex";
  }
  btnCompressRun.style.display = compressFile ? "block" : "none";
}

window.removeCompressFile = function() {
  compressFile = null;
  renderCompressFile();
};

compressFileList.addEventListener('click', (e) => {
  if (e.target.classList.contains('compress-remove-btn')) {
    window.removeCompressFile();
  }
});

// Render Split File
function renderSplitFile() {
  if (splitFile) {
    splitFileList.innerHTML = `
      <div class="file-row">
        <div class="file-info">
          <span>📄</span>
          <span class="file-name">${splitFile.name}</span>
          <span class="file-size">(${(splitFile.size / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <button class="file-action-btn split-remove-btn">✕</button>
      </div>
    `;
    splitDropzone.style.display = "none";
    splitControls.style.display = "block";
  } else {
    splitFileList.innerHTML = "";
    splitDropzone.style.display = "flex";
    splitControls.style.display = "none";
  }
  btnSplitRun.style.display = splitFile ? "block" : "none";
}

window.removeSplitFile = function() {
  splitFile = null;
  renderSplitFile();
};

splitFileList.addEventListener('click', (e) => {
  if (e.target.classList.contains('split-remove-btn')) {
    window.removeSplitFile();
  }
});

// Render Rotate File
function renderRotateFile() {
  if (rotateFile) {
    rotateFileList.innerHTML = `
      <div class="file-row">
        <div class="file-info">
          <span>📄</span>
          <span class="file-name">${rotateFile.name}</span>
          <span class="file-size">(${(rotateFile.size / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <button class="file-action-btn rotate-remove-btn">✕</button>
      </div>
    `;
    rotateDropzone.style.display = "none";
    rotateControls.style.display = "block";
  } else {
    rotateFileList.innerHTML = "";
    rotateDropzone.style.display = "flex";
    rotateControls.style.display = "none";
  }
  btnRotateRun.style.display = rotateFile ? "block" : "none";
}

window.removeRotateFile = function() {
  rotateFile = null;
  renderRotateFile();
};

rotateFileList.addEventListener('click', (e) => {
  if (e.target.classList.contains('rotate-remove-btn')) {
    window.removeRotateFile();
  }
});

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
    
    showToast("PDFs Merged Successfully!");
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

// Execute Image to PDF
btnImageRun.addEventListener("click", async () => {
  if (imageFiles.length === 0) return;
  btnImageRun.textContent = "Converting Images...";
  btnImageRun.disabled = true;

  try {
    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();

    for (const file of imageFiles) {
      const buffer = await file.arrayBuffer();
      let image;
      if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
        image = await pdfDoc.embedPng(buffer);
      } else {
        image = await pdfDoc.embedJpg(buffer);
      }
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    downloadPdf(pdfBytes, "images_converted.pdf");
    
    showToast("Images Converted Successfully!");
    btnImageRun.textContent = "Convert to PDF";
    btnImageRun.disabled = false;
    imageFiles = [];
    renderImageFiles();
  } catch(e) {
    alert("Error converting images to PDF");
    console.error(e);
    btnImageRun.textContent = "Failed. Try again";
    btnImageRun.disabled = false;
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
    
    const level = document.getElementById("compress-level").value;
    const saveOptions = { useObjectStreams: true };
    if (level === "low") {
      saveOptions.useObjectStreams = false;
    }
    
    const compressedBytes = await doc.save(saveOptions);
    
    downloadPdf(compressedBytes, "compressed_document.pdf");
    
    showToast("PDF Compressed Successfully!");
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

// Execute Split
btnSplitRun.addEventListener("click", async () => {
  if (!splitFile) return;
  btnSplitRun.textContent = "Extracting Pages...";
  btnSplitRun.disabled = true;

  try {
    const { PDFDocument } = window.PDFLib;
    const buffer = await splitFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(buffer);
    const splitDoc = await PDFDocument.create();
    
    const pageCount = srcDoc.getPageCount();
    const indices = [];
    const rangeStr = splitRangesInput.value.trim();
    
    if (!rangeStr) {
      // Split all pages into indices
      for (let i = 0; i < pageCount; i++) {
        indices.push(i);
      }
    } else {
      const parts = rangeStr.split(",");
      for (let part of parts) {
        part = part.trim();
        if (part.includes("-")) {
          const bounds = part.split("-");
          const start = parseInt(bounds[0]) || 1;
          const end = parseInt(bounds[1]) || pageCount;
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= pageCount) {
              indices.push(i - 1);
            }
          }
        } else {
          const pageNum = parseInt(part);
          if (pageNum >= 1 && pageNum <= pageCount) {
            indices.push(pageNum - 1);
          }
        }
      }
    }

    if (indices.length === 0) {
      alert("No valid pages found in range.");
      btnSplitRun.textContent = "Extract Pages & Save";
      btnSplitRun.disabled = false;
      return;
    }

    const copiedPages = await splitDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => splitDoc.addPage(p));

    const bytes = await splitDoc.save();
    const baseName = splitFile.name.substring(0, splitFile.name.lastIndexOf('.')) || splitFile.name;
    downloadPdf(bytes, `${baseName}_split.pdf`);

    showToast("PDF Split Successfully!");
    btnSplitRun.textContent = "Extract Pages & Save";
    btnSplitRun.disabled = false;
    splitFile = null;
    splitRangesInput.value = "";
    renderSplitFile();
  } catch(e) {
    alert("Error splitting PDF document");
    console.error(e);
    btnSplitRun.textContent = "Failed. Try again";
    btnSplitRun.disabled = false;
  }
});

// Execute Rotate
btnRotateRun.addEventListener("click", async () => {
  if (!rotateFile) return;
  btnRotateRun.textContent = "Rotating Pages...";
  btnRotateRun.disabled = true;

  try {
    const { PDFDocument, degrees } = window.PDFLib;
    const buffer = await rotateFile.arrayBuffer();
    const doc = await PDFDocument.load(buffer);
    
    const angle = parseInt(rotateAngleSelect.value) || 90;
    const pages = doc.getPages();
    pages.forEach(page => {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + angle));
    });

    const bytes = await doc.save();
    const baseName = rotateFile.name.substring(0, rotateFile.name.lastIndexOf('.')) || rotateFile.name;
    downloadPdf(bytes, `${baseName}_rotated.pdf`);

    showToast("PDF Rotated Successfully!");
    btnRotateRun.textContent = "Rotate & Save PDF";
    btnRotateRun.disabled = false;
    rotateFile = null;
    renderRotateFile();
  } catch(e) {
    alert("Error rotating PDF document");
    console.error(e);
    btnRotateRun.textContent = "Failed. Try again";
    btnRotateRun.disabled = false;
  }
});

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

