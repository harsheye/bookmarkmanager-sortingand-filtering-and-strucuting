// image.js - Logic for clipboard image converter and scaler

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const previewPanel = document.getElementById("preview-panel");
const previewImg = document.getElementById("preview-img");

const infoName = document.getElementById("info-name");
const infoDims = document.getElementById("info-dims");
const infoSize = document.getElementById("info-size");
const widthInput = document.getElementById("width-input");

let activeImageBlob = null;
let activeImageSrc = "";
let originalWidth = 0;
let originalHeight = 0;
let originalName = "image.png";

// trigger file select
dropzone.addEventListener("click", () => fileInput.click());

// drag and drop events
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
    handleImageFile(e.dataTransfer.files[0]);
  }
});

// input select events
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleImageFile(e.target.files[0]);
  }
});

// listen for Ctrl+V paste
window.addEventListener("paste", (e) => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const blob = items[i].getAsFile();
      originalName = "clipboard_image.png";
      handleImageFile(blob);
      break;
    }
  }
});

function handleImageFile(blob) {
  if (!blob || blob.type.indexOf("image") === -1) return;
  activeImageBlob = blob;
  originalName = blob.name || "image.png";
  
  // calculate size
  const kb = (blob.size / 1024).toFixed(1);
  infoSize.textContent = `${kb} KB`;
  infoName.textContent = originalName;

  const url = URL.createObjectURL(blob);
  activeImageSrc = url;
  previewImg.src = url;

  previewImg.onload = () => {
    originalWidth = previewImg.naturalWidth;
    originalHeight = previewImg.naturalHeight;
    infoDims.textContent = `${originalWidth} x ${originalHeight} px`;
    widthInput.value = originalWidth;
  };

  previewPanel.style.display = "flex";
}

// scaling operations
document.getElementById("btn-scale").addEventListener("click", () => {
  const newWidth = parseInt(widthInput.value);
  if (!newWidth || newWidth <= 0 || !activeImageBlob) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const scale = newWidth / originalWidth;
  const newHeight = Math.round(originalHeight * scale);

  canvas.width = newWidth;
  canvas.height = newHeight;

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    canvas.toBlob((scaledBlob) => {
      handleImageFile(scaledBlob);
    }, activeImageBlob.type);
  };
  img.src = activeImageSrc;
});

// convert and export formats
document.getElementById("btn-webp").addEventListener("click", () => exportImage("image/webp", "webp"));
document.getElementById("btn-png").addEventListener("click", () => exportImage("image/png", "png"));
document.getElementById("btn-jpg").addEventListener("click", () => exportImage("image/jpeg", "jpg"));

function exportImage(mimeType, extension) {
  if (!activeImageBlob) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = originalWidth;
  canvas.height = originalHeight;

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, originalWidth, originalHeight);
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      a.download = `${nameWithoutExt}.${extension}`;
      a.click();
    }, mimeType);
  };
  img.src = activeImageSrc;
}
