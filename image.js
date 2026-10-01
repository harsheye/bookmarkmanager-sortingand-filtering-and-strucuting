// image.js - Controller for Premium Windows Photo App style Image Editor

// DOM Elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const previewPanel = document.getElementById("preview-panel");
const previewImg = document.getElementById("preview-img");
const imageWrapper = document.getElementById("image-wrapper");

// Navigation & Actions
const btnBack = document.getElementById("btn-back");
const tabTransform = document.getElementById("tab-transform");
const tabAdjustments = document.getElementById("tab-adjustments");
const btnCancel = document.getElementById("btn-cancel");
const editorContainer = document.getElementById("editor-container");
const adjustmentsSidebar = document.getElementById("adjustments-sidebar");
const floatingTransformToolbar = document.getElementById("floating-transform-toolbar");
const editorHeader = document.getElementById("editor-header");

// Metadata Labels
const infoName = document.getElementById("info-name");
const metaOrigDims = document.getElementById("meta-orig-dims");
const metaCurrDims = document.getElementById("meta-curr-dims");
const metaSize = document.getElementById("meta-size");
const metadataBar = document.getElementById("metadata-bar");

// Bottom / Transform Controls
const btnRotLeft = document.getElementById("btn-rot-left");
const btnRotRight = document.getElementById("btn-rot-right");
const angleSlider = document.getElementById("angle-slider");
const angleDisplay = document.getElementById("angle-display");
const aspectTrigger = document.getElementById("aspect-dropdown-trigger");
const aspectOptionsContainer = document.getElementById("aspect-dropdown-options");
const aspectCurrentLabel = document.getElementById("aspect-current-label");
const aspectOptions = document.querySelectorAll(".select-option");
const btnFlipH = document.getElementById("btn-flip-h");
const btnFlipV = document.getElementById("btn-flip-v");

// Zoom Controls
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnFullscreen = document.getElementById("btn-fullscreen");
const zoomDisplay = document.getElementById("zoom-display");
const workspace = document.querySelector(".workspace");

// Crop Mode Elements
const btnCropMode = document.getElementById("btn-crop-mode");
const btnApplyCrop = document.getElementById("btn-apply-crop");
const cropBox = document.getElementById("crop-box");

// Resize Modal Elements
const resizeModal = document.getElementById("resize-modal");
const widthInput = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const lockAspectCheckbox = document.getElementById("lock-aspect");
const btnCloseResize = document.getElementById("btn-close-resize");
const btnApplyResize = document.getElementById("btn-apply-resize");

// Compress Modal Elements
const compressModal = document.getElementById("compress-modal");
const targetSizeInput = document.getElementById("target-size-input");
const btnCloseCompress = document.getElementById("btn-close-compress");
const btnApplyCompress = document.getElementById("btn-apply-compress");

// State Variables
let rotationAngle = 0; // Increments of 90 degrees
let manualAngle = 0;   // Slider offset (-45 to 45)
let zoomScale = 1.0;
let cropModeActive = false;
let flipH = false;
let flipV = false;
let activeImageBlob = null;
let initialImageBlob = null;
let activeImageSrc = "";
let originalWidth = 0;
let originalHeight = 0;
let currentWidth = 0;
let currentHeight = 0;
let aspectRatio = 1;
let originalName = "clipboard_image.png";

// Batch Mode State & Selectors
let batchFiles = [];
let batchModeActive = false;
const batchPanel = document.getElementById("batch-panel");
const batchFilesGrid = document.getElementById("batch-files-grid");
const btnProcessBatch = document.getElementById("btn-process-batch");

let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

const filters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0
};

// Crop drag/resize coordinates state
let isDraggingCrop = false;
let isResizingCrop = false;
let activeHandle = null;
let startX, startY, startLeft, startTop, startWidth, startHeight;

// 1. Navigation / Tab Switches
btnBack.addEventListener("click", () => {
  window.location.href = "newtab.html";
});

btnCancel.addEventListener("click", resetEditorState);

tabTransform.addEventListener("click", () => {
  tabTransform.classList.add("active");
  tabAdjustments.classList.remove("active");
  if (floatingTransformToolbar) floatingTransformToolbar.classList.remove("hidden");
  adjustmentsSidebar.classList.add("hidden");
  editorContainer.classList.remove("with-sidebar");
});

tabAdjustments.addEventListener("click", () => {
  tabAdjustments.classList.add("active");
  tabTransform.classList.remove("active");
  if (floatingTransformToolbar) floatingTransformToolbar.classList.add("hidden");
  adjustmentsSidebar.classList.remove("hidden");
  editorContainer.classList.add("with-sidebar");
  toggleCropMode(false); // Disable crop mode when switching tabs
});

// Modal Toggles
document.getElementById("opt-open-resize").addEventListener("click", (e) => {
  e.stopPropagation();
  resizeModal.classList.remove("hidden");
});
btnCloseResize.addEventListener("click", () => resizeModal.classList.add("hidden"));

document.getElementById("opt-open-compress").addEventListener("click", (e) => {
  e.stopPropagation();
  compressModal.classList.remove("hidden");
});
btnCloseCompress.addEventListener("click", () => compressModal.classList.add("hidden"));

// 2. Drag & Drop / Clipboard Paste Bindings
dropzone.addEventListener("click", () => fileInput.click());
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
  if (e.dataTransfer.files.length > 1) {
    handleBatchFiles(e.dataTransfer.files);
  } else if (e.dataTransfer.files.length === 1) {
    handleImageFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", async (e) => {
  if (e.target.files.length > 0) {
    if (batchModeActive) {
      // Append files to existing batch
      const newFiles = Array.from(e.target.files);
      const startIdx = batchFiles.length;
      
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        if (file.type.indexOf("image") === -1) continue;
        
        const id = "batch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5);
        const src = URL.createObjectURL(file);
        
        const entry = {
          id: id,
          file: file,
          name: file.name || `image_${startIdx + i + 1}.png`,
          size: file.size,
          type: file.type,
          src: src,
          width: 0,
          height: 0,
          aspectRatio: 1
        };
        
        batchFiles.push(entry);
        
        await new Promise((resolve) => {
          const tempImg = new Image();
          tempImg.onload = () => {
            entry.width = tempImg.naturalWidth;
            entry.height = tempImg.naturalHeight;
            entry.aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
            resolve();
          };
          tempImg.onerror = resolve;
          tempImg.src = src;
        });
      }
      
      infoName.textContent = `Batch Processing (${batchFiles.length} files)`;
      renderBatchGrid();
    } else {
      if (e.target.files.length > 1) {
        handleBatchFiles(e.target.files);
      } else {
        handleImageFile(e.target.files[0]);
      }
    }
  }
});

window.addEventListener("paste", (e) => {
  const items = e.clipboardData.items;
  const pastedFiles = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const blob = items[i].getAsFile();
      if (blob) pastedFiles.push(blob);
    }
  }
  
  if (pastedFiles.length > 1) {
    handleBatchFiles(pastedFiles);
  } else if (pastedFiles.length === 1) {
    originalName = "clipboard_image.png";
    handleImageFile(pastedFiles[0]);
  }
});

function handleImageFile(blob) {
  if (!blob || blob.type.indexOf("image") === -1) return;
  activeImageBlob = blob;
  if (!initialImageBlob) initialImageBlob = blob;
  originalName = blob.name || "clipboard_image.png";
  infoName.textContent = originalName;

  // Calculate size
  const kb = (blob.size / 1024).toFixed(1);
  metaSize.textContent = `${kb} KB`;

  const url = URL.createObjectURL(blob);
  activeImageSrc = url;
  previewImg.src = url;

  previewImg.onload = () => {
    originalWidth = previewImg.naturalWidth;
    originalHeight = previewImg.naturalHeight;
    currentWidth = originalWidth;
    currentHeight = originalHeight;
    aspectRatio = originalWidth / originalHeight;
    
    metaOrigDims.textContent = `${originalWidth} x ${originalHeight} px`;
    metaCurrDims.textContent = `${currentWidth} x ${currentHeight} px`;
    
    widthInput.value = currentWidth;
    heightInput.value = currentHeight;
  };

  dropzone.classList.add("hidden");
  previewPanel.classList.remove("hidden");
  metadataBar.classList.remove("hidden");
  if (editorHeader) editorHeader.classList.remove("hidden");
  if (floatingTransformToolbar) floatingTransformToolbar.classList.remove("hidden");
}

function resetEditorState() {
  activeImageBlob = null;
  initialImageBlob = null;
  activeImageSrc = "";
  originalName = "clipboard_image.png";
  previewImg.src = "";
  
  infoName.textContent = originalName;
  metaOrigDims.textContent = "-";
  metaCurrDims.textContent = "-";
  metaSize.textContent = "-";
  
  resetFilters();
  rotationAngle = 0;
  manualAngle = 0;
  angleSlider.value = 0;
  angleDisplay.textContent = "0°";
  flipH = false;
  flipV = false;
  applyTransformations();
  toggleCropMode(false);

  panX = 0;
  panY = 0;
  zoomScale = 1.0;
  applyZoom();
  
  // Clear batch state
  batchFiles.forEach(bf => URL.revokeObjectURL(bf.src));
  batchFiles = [];
  batchModeActive = false;
  const progressContainer = document.getElementById("batch-progress-container");
  if (progressContainer) progressContainer.classList.add("hidden");
  toggleBatchMode(false);

  // Reset tabs to default (Transform)
  tabTransform.click();

  previewPanel.classList.add("hidden");
  metadataBar.classList.add("hidden");
  if (editorHeader) editorHeader.classList.add("hidden");
  if (floatingTransformToolbar) floatingTransformToolbar.classList.add("hidden");

  // Reset custom aspect ratio dropdown
  if (aspectCurrentLabel) aspectCurrentLabel.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg> Free Aspect`;
  aspectOptions.forEach(o => {
    if (o.dataset.value === "free") o.classList.add("active");
    else o.classList.remove("active");
  });
  
  dropzone.classList.remove("hidden");
}

// 3. Zoom & Fullscreen Functionality
btnZoomIn.addEventListener("click", () => {
  zoomScale = Math.min(4.0, zoomScale + 0.15);
  applyZoom();
});

btnZoomOut.addEventListener("click", () => {
  zoomScale = Math.max(0.15, zoomScale - 0.15);
  applyZoom();
});

// Click zoom percentage value text to reset back to 100%
zoomDisplay.addEventListener("click", () => {
  zoomScale = 1.0;
  applyZoom();
});

// Scroll wheel mouse zoom
workspace.addEventListener("wheel", (e) => {
  if (!activeImageBlob) return;
  e.preventDefault();
  
  const zoomFactor = 0.08;
  if (e.deltaY < 0) {
    zoomScale = Math.min(4.0, zoomScale + zoomFactor);
  } else {
    zoomScale = Math.max(0.15, zoomScale - zoomFactor);
  }
  applyZoom();
}, { passive: false });

// Fullscreen API toggle
btnFullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error("Fullscreen failed:", err);
    });
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    btnFullscreen.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>
    `;
    btnFullscreen.title = "Exit Full Screen";
  } else {
    btnFullscreen.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
    `;
    btnFullscreen.title = "Toggle Full Screen";
  }
});

// Panning events on workspace
workspace.addEventListener("mousedown", (e) => {
  // Ignore clicks inside the crop box or on controls/sliders
  if (cropModeActive && (e.target === cropBox || cropBox.contains(e.target))) {
    return;
  }
  // Ignore clicks on floating transform toolbar or sidebar or header
  if (e.target.closest("#floating-transform-toolbar") || e.target.closest("#adjustments-sidebar") || e.target.closest("#editor-header")) {
    return;
  }
  if (!activeImageBlob) return;
  
  isPanning = true;
  startPanX = e.clientX - panX;
  startPanY = e.clientY - panY;
  
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  
  panX = e.clientX - startPanX;
  panY = e.clientY - startPanY;
  
  applyZoom();
});

window.addEventListener("mouseup", () => {
  isPanning = false;
});

function applyZoom() {
  imageWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  zoomDisplay.textContent = `${Math.round(zoomScale * 100)}%`;
}

// 4. Crop Mode Toggle & Handlers
btnCropMode.addEventListener("click", () => {
  toggleCropMode(!cropModeActive);
});

function toggleCropMode(active) {
  cropModeActive = active;
  if (active) {
    btnCropMode.classList.add("active");
    btnApplyCrop.classList.remove("hidden");
    cropBox.classList.remove("hidden");
    
    // Default box: 80% size centered inside wrapper
    const w = imageWrapper.offsetWidth;
    const h = imageWrapper.offsetHeight;
    const cropW = Math.round(w * 0.8);
    const cropH = Math.round(h * 0.8);
    const cropL = Math.round((w - cropW) / 2);
    const cropT = Math.round((h - cropH) / 2);
    
    cropBox.style.width = `${cropW}px`;
    cropBox.style.height = `${cropH}px`;
    cropBox.style.left = `${cropL}px`;
    cropBox.style.top = `${cropT}px`;
  } else {
    btnCropMode.classList.remove("active");
    btnApplyCrop.classList.add("hidden");
    cropBox.classList.add("hidden");
  }
}

// Drag & Resize Crop Overlay Mouse Listeners
cropBox.addEventListener("mousedown", (e) => {
  if (!cropModeActive) return;
  
  if (e.target.classList.contains("crop-handle")) {
    isResizingCrop = true;
    activeHandle = e.target.dataset.handle;
  } else {
    isDraggingCrop = true;
  }
  
  startX = e.clientX;
  startY = e.clientY;
  startLeft = parseInt(cropBox.style.left) || 0;
  startTop = parseInt(cropBox.style.top) || 0;
  startWidth = cropBox.offsetWidth;
  startHeight = cropBox.offsetHeight;
  
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingCrop && !isResizingCrop) return;
  
  // Since parent imageWrapper is scaled by zoomScale, delta mouse values need to adjust
  const dx = (e.clientX - startX) / zoomScale;
  const dy = (e.clientY - startY) / zoomScale;
  
  const wrapperW = imageWrapper.offsetWidth;
  const wrapperH = imageWrapper.offsetHeight;
  
  if (isDraggingCrop) {
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;
    
    // Bounds limits
    newLeft = Math.max(0, Math.min(newLeft, wrapperW - cropBox.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, wrapperH - cropBox.offsetHeight));
    
    cropBox.style.left = `${newLeft}px`;
    cropBox.style.top = `${newTop}px`;
  } else if (isResizingCrop) {
    let newLeft = startLeft;
    let newTop = startTop;
    let newWidth = startWidth;
    let newHeight = startHeight;
    
    if (activeHandle.includes("r")) {
      newWidth = Math.max(30, Math.min(startWidth + dx, wrapperW - startLeft));
    }
    if (activeHandle.includes("b")) {
      newHeight = Math.max(30, Math.min(startHeight + dy, wrapperH - startTop));
    }
    if (activeHandle.includes("l")) {
      const maxL = startWidth - 30;
      const calculatedLeft = Math.max(0, Math.min(startLeft + dx, startLeft + maxL));
      newWidth = startWidth - (calculatedLeft - startLeft);
      newLeft = calculatedLeft;
    }
    if (activeHandle.includes("t")) {
      const maxT = startHeight - 30;
      const calculatedTop = Math.max(0, Math.min(startTop + dy, startTop + maxT));
      newHeight = startHeight - (calculatedTop - startTop);
      newTop = calculatedTop;
    }
    
    cropBox.style.left = `${newLeft}px`;
    cropBox.style.top = `${newTop}px`;
    cropBox.style.width = `${newWidth}px`;
    cropBox.style.height = `${newHeight}px`;
  }
});

window.addEventListener("mouseup", () => {
  isDraggingCrop = false;
  isResizingCrop = false;
  activeHandle = null;
});

// Apply crop selector canvas extraction
btnApplyCrop.addEventListener("click", async () => {
  if (!activeImageBlob) return;
  
  const w = imageWrapper.offsetWidth;
  const h = imageWrapper.offsetHeight;
  const cropL = cropBox.offsetLeft;
  const cropT = cropBox.offsetTop;
  const cropW = cropBox.offsetWidth;
  const cropH = cropBox.offsetHeight;
  
  const xPct = cropL / w;
  const yPct = cropT / h;
  const wPct = cropW / w;
  const hPct = cropH / h;
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  // Calculate relative crop coordinates on natural source resolution
  const cropX = xPct * originalWidth;
  const cropY = yPct * originalHeight;
  const cropNaturalW = wPct * originalWidth;
  const cropNaturalH = hPct * originalHeight;
  
  canvas.width = cropNaturalW;
  canvas.height = cropNaturalH;
  
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, cropX, cropY, cropNaturalW, cropNaturalH, 0, 0, cropNaturalW, cropNaturalH);
      resolve();
    };
    img.onerror = reject;
    img.src = activeImageSrc;
  });
  
  canvas.toBlob((blob) => {
    toggleCropMode(false);
    handleImageFile(blob);
    showToast("Area cropped successfully!");
  }, "image/png");
});

// 5. Transformations & Rotation
btnRotLeft.addEventListener("click", () => {
  rotationAngle = (rotationAngle - 90) % 360;
  if (rotationAngle < 0) rotationAngle += 360;
  applyTransformations();
});

btnRotRight.addEventListener("click", () => {
  rotationAngle = (rotationAngle + 90) % 360;
  applyTransformations();
});

angleSlider.addEventListener("input", (e) => {
  manualAngle = parseInt(e.target.value) || 0;
  angleDisplay.textContent = `${manualAngle}°`;
  applyTransformations();
});

btnFlipH.addEventListener("click", () => {
  flipH = !flipH;
  applyTransformations();
});

btnFlipV.addEventListener("click", () => {
  flipV = !flipV;
  applyTransformations();
});

function applyTransformations() {
  const totalAngle = rotationAngle + manualAngle;
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  previewImg.style.transform = `rotate(${totalAngle}deg) scale(${scaleX}, ${scaleY})`;
}

function resetTransformationsUI() {
  rotationAngle = 0;
  manualAngle = 0;
  flipH = false;
  flipV = false;
  angleSlider.value = 0;
  angleDisplay.textContent = "0°";
  applyTransformations();

  filters.brightness = 100;
  filters.contrast = 100;
  filters.saturate = 100;
  filters.blur = 0;
  filters.grayscale = 0;
  filters.sepia = 0;
  filters.invert = 0;

  document.getElementById("f-brightness").value = 100;
  document.getElementById("f-contrast").value = 100;
  document.getElementById("f-saturate").value = 100;
  document.getElementById("f-blur").value = 0;
  document.getElementById("f-grayscale").value = 0;
  document.getElementById("f-sepia").value = 0;
  document.getElementById("f-invert").value = 0;
  
  applyFilters();
}

// Custom Aspect Ratio Dropdown logic
aspectTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  aspectOptionsContainer.classList.toggle("hidden");
});

window.addEventListener("click", () => {
  aspectOptionsContainer.classList.add("hidden");
});

aspectOptions.forEach(opt => {
  opt.addEventListener("click", (e) => {
    e.stopPropagation();
    
    // Remove active state from all items
    aspectOptions.forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    
    const val = opt.dataset.value;
    aspectCurrentLabel.textContent = opt.textContent;
    aspectOptionsContainer.classList.add("hidden");
    
    changeAspectRatio(val);
  });
});

function changeAspectRatio(mode) {
  if (!activeImageBlob) return;
  
  let targetRatio = aspectRatio;
  if (mode === "square") targetRatio = 1;
  else if (mode === "16-9") targetRatio = 16 / 9;
  else if (mode === "4-3") targetRatio = 4 / 3;
  else if (mode === "free") targetRatio = aspectRatio;

  currentHeight = Math.round(currentWidth / targetRatio);
  heightInput.value = currentHeight;
  metaCurrDims.textContent = `${currentWidth} x ${currentHeight} px`;
}

// 6. Creative Adjustments
const sliders = document.querySelectorAll(".filter-slider");
sliders.forEach(slider => {
  slider.addEventListener("input", (e) => {
    const id = e.target.id;
    const val = e.target.value;
    
    if (id === "filter-bright") {
      filters.brightness = val;
      document.getElementById("filter-bright-val").textContent = `${val}%`;
    } else if (id === "filter-contrast") {
      filters.contrast = val;
      document.getElementById("filter-contrast-val").textContent = `${val}%`;
    } else if (id === "filter-saturate") {
      filters.saturation = val; // map correct key
      filters.saturate = val;
      document.getElementById("filter-saturate-val").textContent = `${val}%`;
    } else if (id === "filter-blur") {
      filters.blur = val;
      document.getElementById("filter-blur-val").textContent = `${val}px`;
    } else if (id === "filter-gray") {
      filters.grayscale = val;
      document.getElementById("filter-gray-val").textContent = `${val}%`;
    } else if (id === "filter-sepia") {
      filters.sepia = val;
      document.getElementById("filter-sepia-val").textContent = `${val}%`;
    } else if (id === "filter-invert") {
      filters.invert = val;
      document.getElementById("filter-invert-val").textContent = `${val}%`;
    }
    applyPreviewFilters();
  });
});

document.getElementById("btn-reset-filters").addEventListener("click", resetFilters);

function resetFilters() {
  filters.brightness = 100;
  filters.contrast = 100;
  filters.saturate = 100;
  filters.blur = 0;
  filters.grayscale = 0;
  filters.sepia = 0;
  filters.invert = 0;

  document.getElementById("filter-bright").value = 100;
  document.getElementById("filter-contrast").value = 100;
  document.getElementById("filter-saturate").value = 100;
  document.getElementById("filter-blur").value = 0;
  document.getElementById("filter-gray").value = 0;
  document.getElementById("filter-sepia").value = 0;
  document.getElementById("filter-invert").value = 0;

  document.getElementById("filter-bright-val").textContent = "100%";
  document.getElementById("filter-contrast-val").textContent = "100%";
  document.getElementById("filter-saturate-val").textContent = "100%";
  document.getElementById("filter-blur-val").textContent = "0px";
  document.getElementById("filter-gray-val").textContent = "0%";
  document.getElementById("filter-sepia-val").textContent = "0%";
  document.getElementById("filter-invert-val").textContent = "0%";

  applyPreviewFilters();
}

function applyPreviewFilters() {
  const filterString = `
    brightness(${filters.brightness}%) 
    contrast(${filters.contrast}%) 
    saturate(${filters.saturate}%) 
    blur(${filters.blur}px) 
    grayscale(${filters.grayscale}%) 
    sepia(${filters.sepia}%) 
    invert(${filters.invert}%)
  `;
  previewImg.style.filter = filterString;
}

document.querySelectorAll('input[type="number"]').forEach(el => {
  el.addEventListener('wheel', (e) => e.preventDefault());
});

document.getElementById("btn-revert").addEventListener("click", () => {
  if (initialImageBlob) {
    handleImageFile(initialImageBlob);
    setTimeout(resetTransformationsUI, 50);
    showToast("Reverted to original image.");
  }
});

document.getElementById("opt-copy-clipboard").addEventListener("click", () => {
  if (!activeImageBlob) return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const totalAngle = rotationAngle + manualAngle;
  const isRotated = totalAngle % 180 !== 0;

  const canvasWidth = isRotated ? currentHeight : currentWidth;
  const canvasHeight = isRotated ? currentWidth : currentHeight;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const filterString = `
    brightness(${filters.brightness}%) 
    contrast(${filters.contrast}%) 
    saturate(${filters.saturate}%) 
    blur(${filters.blur}px) 
    grayscale(${filters.grayscale}%) 
    sepia(${filters.sepia}%) 
    invert(${filters.invert}%)
  `;
  ctx.filter = filterString.replace(/\s+/g, ' ');

  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((totalAngle * Math.PI) / 180);

  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  ctx.scale(scaleX, scaleY);

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, -currentWidth / 2, -currentHeight / 2, currentWidth, currentHeight);
    canvas.toBlob(async (blob) => {
      try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        showToast("Copied to clipboard!");
      } catch (err) {
        console.error(err);
        showToast("Failed to copy image to clipboard.");
      }
    }, "image/png");
  };
  img.src = activeImageSrc;
});

// 7. Dimension Resizing
widthInput.addEventListener("input", () => {
  const w = parseInt(widthInput.value) || 0;
  if (w > 0 && lockAspectCheckbox.checked) {
    heightInput.value = Math.round(w / aspectRatio);
  }
});

heightInput.addEventListener("input", () => {
  const h = parseInt(heightInput.value) || 0;
  if (h > 0 && lockAspectCheckbox.checked) {
    widthInput.value = Math.round(h * aspectRatio);
  }
});

btnApplyResize.addEventListener("click", () => {
  const w = parseInt(widthInput.value) || 0;
  const h = parseInt(heightInput.value) || 0;
  if (w > 0 && h > 0) {
    currentWidth = w;
    currentHeight = h;
    aspectRatio = currentWidth / currentHeight; // Fix aspect ratio update
    metaCurrDims.textContent = `${currentWidth} x ${currentHeight} px`;
    resizeModal.classList.add("hidden");
    showToast(`Dimensions resized to ${currentWidth} x ${currentHeight} px`);
  }
});

// 8. Target-Size Image Compression
btnApplyCompress.addEventListener("click", async () => {
  let targetVal = parseFloat(targetSizeInput.value);
  const targetUnit = document.getElementById("target-size-unit").value;
  if (!targetVal || targetVal <= 0) {
    alert("Please enter a valid target size (greater than 0).");
    return;
  }
  if (!activeImageBlob) return;

  btnApplyCompress.textContent = "Compressing...";
  btnApplyCompress.disabled = true;

  try {
    if (targetUnit === "MB") targetVal *= 1024;
    const targetBytes = targetVal * 1024;
    const canvas = document.createElement("canvas");
    const canvasCtx = canvas.getContext("2d");

    const totalAngle = rotationAngle + manualAngle;
    const isRotated = totalAngle % 180 !== 0;

    const canvasWidth = isRotated ? currentHeight : currentWidth;
    const canvasHeight = isRotated ? currentWidth : currentHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const filterString = `
      brightness(${filters.brightness}%) 
      contrast(${filters.contrast}%) 
      saturate(${filters.saturate}%) 
      blur(${filters.blur}px) 
      grayscale(${filters.grayscale}%) 
      sepia(${filters.sepia}%) 
      invert(${filters.invert}%)
    `;
    canvasCtx.filter = filterString.replace(/\s+/g, ' ');

    canvasCtx.translate(canvasWidth / 2, canvasHeight / 2);
    canvasCtx.rotate((totalAngle * Math.PI) / 180);

    const scaleX = flipH ? -1 : 1;
    const scaleY = flipV ? -1 : 1;
    canvasCtx.scale(scaleX, scaleY);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => {
        canvasCtx.drawImage(img, -currentWidth / 2, -currentHeight / 2, currentWidth, currentHeight);
        resolve();
      };
      img.onerror = reject;
      img.src = activeImageSrc;
    });

    let finalBlob = null;
    let finalQuality = 0.9;
    let scale = 1.0;

    // Fast-path: Check if quality 0.9 already meets target at full scale
    const initBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
    if (initBlob.size <= targetBytes) {
      finalBlob = initBlob;
      finalQuality = 0.9;
    } else {
      // Loop to try scaling down if JPEG quality isn't enough
      for (let attempt = 0; attempt < 3; attempt++) {
        let low = 0.01;
        let high = 0.9;
        let bestBlobAtScale = null;

        // Binary search for optimal quality (max 4 iterations for extreme speed)
        for (let i = 0; i < 4; i++) {
          const mid = (low + high) / 2;
          const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", mid));
          if (blob.size <= targetBytes) {
            bestBlobAtScale = blob;
            finalQuality = mid;
            low = mid;
            // Early exit if within 15% of target!
            if (blob.size >= targetBytes * 0.85) break; 
          } else {
            high = mid;
          }
        }

        if (bestBlobAtScale) {
          finalBlob = bestBlobAtScale;
          break; // We found a blob that fits the target size!
        }

        // If we still couldn't hit the target size, the resolution is too high.
        // Scale down the canvas by 50% area (approx 0.707 linear scale) and try again.
        scale *= 0.707;
        const newW = Math.max(1, Math.floor(canvasWidth * scale));
        const newH = Math.max(1, Math.floor(canvasHeight * scale));
        
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = newW;
        tempCanvas.height = newH;
        const tCtx = tempCanvas.getContext("2d");
        tCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newW, newH);
        
        // Replace original canvas with scaled one
        canvas.width = newW;
        canvas.height = newH;
        canvasCtx.clearRect(0, 0, newW, newH);
        canvasCtx.drawImage(tempCanvas, 0, 0);
      }
    }

    if (!finalBlob) {
      // Ultimate fallback to lowest possible quality at the smallest scale tried
      finalBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.01));
      finalQuality = 0.01;
    }

    // Flatten image: Update the editor workspace with the newly compressed blob!
    handleImageFile(finalBlob);
    
    setTimeout(() => {
      resetTransformationsUI();
      compressModal.classList.add("hidden");
      btnApplyCompress.textContent = "Compress";
      btnApplyCompress.disabled = false;
      showToast(`Success: Compressed to ${(finalBlob.size / 1024).toFixed(1)} KB (JPEG Quality: ${Math.round(finalQuality * 100)}%)`);
    }, 100);

  } catch (err) {
    console.error(err);
    alert("Compression failed: " + err.message);
    btnApplyCompress.textContent = "Compress";
    btnApplyCompress.disabled = false;
  }
});

// 9. Standard Format Exports
document.getElementById("opt-save-webp").addEventListener("click", () => exportImage("image/webp", "webp"));
document.getElementById("opt-save-png").addEventListener("click", () => exportImage("image/png", "png"));
document.getElementById("opt-save-jpeg").addEventListener("click", () => exportImage("image/jpeg", "jpg"));

function exportImage(mimeType, extension) {
  if (!activeImageBlob) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const totalAngle = rotationAngle + manualAngle;
  const isRotated = totalAngle % 180 !== 0;

  const canvasWidth = isRotated ? currentHeight : currentWidth;
  const canvasHeight = isRotated ? currentWidth : currentHeight;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const filterString = `
    brightness(${filters.brightness}%) 
    contrast(${filters.contrast}%) 
    saturate(${filters.saturate}%) 
    blur(${filters.blur}px) 
    grayscale(${filters.grayscale}%) 
    sepia(${filters.sepia}%) 
    invert(${filters.invert}%)
  `;
  ctx.filter = filterString.replace(/\s+/g, ' ');

  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((totalAngle * Math.PI) / 180);

  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  ctx.scale(scaleX, scaleY);

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, -currentWidth / 2, -currentHeight / 2, currentWidth, currentHeight);
    
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const filename = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      a.download = `${filename}_edited.${extension}`;
      a.click();
      showToast(`Image exported successfully as ${extension.toUpperCase()}!`);
    }, mimeType, 0.92);
  };
  img.src = activeImageSrc;
}

// 10. Custom Toast Notifier
function showToast(message) {
  let toast = document.getElementById("toast-notify");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-notify";
    toast.style.cssText = "position:fixed; bottom:24px; right:24px; background:#10b981; color:white; padding:12px 24px; border-radius:8px; font-weight:600; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3); z-index:10000; transition: all 0.3s; opacity:0; transform:translateY(100px);";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(100px)";
  }, 3000);
}

// 11. Batch Processing Actions & UI Controller
async function handleBatchFiles(filesList) {
  batchFiles = [];
  batchModeActive = true;
  
  if (editorHeader) editorHeader.classList.remove("hidden");
  infoName.textContent = `Batch Processing (${filesList.length} files)`;
  
  toggleBatchMode(true);
  
  for (let i = 0; i < filesList.length; i++) {
    const file = filesList[i];
    if (file.type.indexOf("image") === -1) continue;
    
    const id = "batch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5);
    const src = URL.createObjectURL(file);
    
    const entry = {
      id: id,
      file: file,
      name: file.name || `image_${i + 1}.png`,
      size: file.size,
      type: file.type,
      src: src,
      width: 0,
      height: 0,
      aspectRatio: 1
    };
    
    batchFiles.push(entry);
    
    await new Promise((resolve) => {
      const tempImg = new Image();
      tempImg.onload = () => {
        entry.width = tempImg.naturalWidth;
        entry.height = tempImg.naturalHeight;
        entry.aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        resolve();
      };
      tempImg.onerror = resolve;
      tempImg.src = src;
    });
  }
  
  renderBatchGrid();
}

function renderBatchGrid() {
  if (!batchFilesGrid) return;
  batchFilesGrid.innerHTML = "";
  
  batchFiles.forEach((bf) => {
    const card = document.createElement("div");
    card.className = "batch-file-card";
    card.id = `card-${bf.id}`;
    
    const kb = (bf.size / 1024).toFixed(1);
    const dims = bf.width ? `${bf.width}x${bf.height}px` : "Loading...";
    
    card.innerHTML = `
      <div class="batch-file-remove" data-id="${bf.id}">✕</div>
      <img class="batch-file-thumb" src="${bf.src}" alt="${bf.name}">
      <div class="batch-file-info">
        <span class="batch-file-name" title="${bf.name}">${bf.name}</span>
        <span class="batch-file-meta">${dims} • ${kb} KB</span>
      </div>
    `;
    
    card.querySelector(".batch-file-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      removeBatchFile(bf.id);
    });
    
    batchFilesGrid.appendChild(card);
  });
  
  // Add More Files Card
  const addCard = document.createElement("div");
  addCard.className = "batch-add-card";
  addCard.innerHTML = `
    <i class="fi fi-rr-plus batch-add-icon" style="font-size: 24px;"></i>
    <span style="font-size:12px; font-weight:700; color:var(--text-muted);">Add Images</span>
  `;
  addCard.addEventListener("click", () => {
    fileInput.click();
  });
  batchFilesGrid.appendChild(addCard);
}

function removeBatchFile(id) {
  const idx = batchFiles.findIndex(bf => bf.id === id);
  if (idx > -1) {
    URL.revokeObjectURL(batchFiles[idx].src);
    batchFiles.splice(idx, 1);
  }
  
  if (batchFiles.length === 0) {
    resetEditorState();
  } else {
    infoName.textContent = `Batch Processing (${batchFiles.length} files)`;
    renderBatchGrid();
  }
}

function toggleBatchMode(active) {
  const editTabsGrp = document.getElementById("edit-tabs-grp");
  const singleActionsGrp = document.getElementById("single-actions-grp");
  const previewPanel = document.getElementById("preview-panel");
  const metadataBar = document.getElementById("metadata-bar");
  
  if (active) {
    batchModeActive = true;
    if (editTabsGrp) editTabsGrp.classList.add("hidden");
    if (singleActionsGrp) singleActionsGrp.classList.add("hidden");
    if (previewPanel) previewPanel.classList.add("hidden");
    if (metadataBar) metadataBar.classList.add("hidden");
    if (floatingTransformToolbar) floatingTransformToolbar.classList.add("hidden");
    if (adjustmentsSidebar) adjustmentsSidebar.classList.add("hidden");
    editorContainer.classList.remove("with-sidebar");
    
    if (batchPanel) batchPanel.classList.remove("hidden");
    dropzone.classList.add("hidden");
  } else {
    batchModeActive = false;
    if (editTabsGrp) editTabsGrp.classList.remove("hidden");
    if (singleActionsGrp) singleActionsGrp.classList.remove("hidden");
    if (batchPanel) batchPanel.classList.add("hidden");
  }
}

// Side-bar switch bindings
document.getElementById("batch-enable-resize")?.addEventListener("change", (e) => {
  const content = document.getElementById("batch-resize-content");
  if (e.target.checked) content.classList.remove("disabled");
  else content.classList.add("disabled");
});

document.getElementById("batch-enable-convert")?.addEventListener("change", (e) => {
  const content = document.getElementById("batch-convert-content");
  if (e.target.checked) content.classList.remove("disabled");
  else content.classList.add("disabled");
});

document.getElementById("batch-enable-compress")?.addEventListener("change", (e) => {
  const content = document.getElementById("batch-compress-content");
  if (e.target.checked) content.classList.remove("disabled");
  else content.classList.add("disabled");
});

btnProcessBatch?.addEventListener("click", async () => {
  if (batchFiles.length === 0) return;
  
  const enableResize = document.getElementById("batch-enable-resize").checked;
  const lockAspect = document.getElementById("batch-lock-aspect").checked;
  const enableConvert = document.getElementById("batch-enable-convert").checked;
  const enableCompress = document.getElementById("batch-enable-compress").checked;
  
  if (enableResize) {
    const userW = parseInt(document.getElementById("batch-width-input").value);
    const userH = parseInt(document.getElementById("batch-height-input").value);
    if (!userW && !userH) {
      alert("Please specify a target width or height for resizing.");
      return;
    }
  }
  
  if (enableCompress) {
    const targetKB = parseInt(document.getElementById("batch-target-size").value);
    if (!targetKB || targetKB <= 0) {
      alert("Please specify a target file size limit (greater than 0 KB).");
      return;
    }
  }
  
  const progressContainer = document.getElementById("batch-progress-container");
  const progressStatus = document.getElementById("batch-progress-status");
  const progressPercent = document.getElementById("batch-progress-percent");
  const progressBar = document.getElementById("batch-progress-bar");
  
  progressContainer.classList.remove("hidden");
  btnProcessBatch.disabled = true;
  
  const total = batchFiles.length;
  const processed = [];
  
  try {
    for (let i = 0; i < total; i++) {
      const bf = batchFiles[i];
      progressStatus.textContent = `Processing image ${i + 1} of ${total}...`;
      
      const percent = Math.round((i / total) * 100);
      progressPercent.textContent = `${percent}%`;
      progressBar.style.width = `${percent}%`;
      
      const result = await processBatchFile(bf, enableResize, lockAspect, enableConvert, enableCompress);
      processed.push(result);
    }
    
    progressStatus.textContent = "Downloading processed files...";
    progressPercent.textContent = "100%";
    progressBar.style.width = "100%";
    
    // Sequentially download processed files
    for (let i = 0; i < processed.length; i++) {
      const p = processed[i];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(p.blob);
      a.download = p.name;
      a.click();
      await new Promise(r => setTimeout(r, 250)); // small delay to prevent browser blockage
    }
    
    setTimeout(() => {
      progressContainer.classList.add("hidden");
      btnProcessBatch.disabled = false;
      showToast(`Batch processed: ${total} files downloaded!`);
    }, 1000);
    
  } catch (err) {
    console.error(err);
    alert("Batch processing failed: " + err.message);
    progressContainer.classList.add("hidden");
    btnProcessBatch.disabled = false;
  }
});

async function processBatchFile(bf, enableResize, lockAspect, enableConvert, enableCompress) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = bf.src;
  });
  
  let targetW = bf.width;
  let targetH = bf.height;
  
  if (enableResize) {
    const userW = parseInt(document.getElementById("batch-width-input").value);
    const userH = parseInt(document.getElementById("batch-height-input").value);
    
    if (lockAspect) {
      if (userW) {
        targetW = userW;
        targetH = Math.round(userW / bf.aspectRatio);
      } else if (userH) {
        targetH = userH;
        targetW = Math.round(userH * bf.aspectRatio);
      }
    } else {
      if (userW) targetW = userW;
      if (userH) targetH = userH;
    }
  }
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = targetW;
  canvas.height = targetH;
  ctx.drawImage(img, 0, 0, targetW, targetH);
  
  let mimeType = bf.type;
  let ext = bf.name.split('.').pop();
  let baseName = bf.name.substring(0, bf.name.lastIndexOf('.')) || bf.name;
  
  if (enableConvert) {
    const selectedFormat = document.getElementById("batch-format-select").value;
    if (selectedFormat === "webp") {
      mimeType = "image/webp";
      ext = "webp";
    } else if (selectedFormat === "png") {
      mimeType = "image/png";
      ext = "png";
    } else if (selectedFormat === "jpeg") {
      mimeType = "image/jpeg";
      ext = "jpg";
    }
  }
  
  let finalBlob = null;
  if (enableCompress) {
    const targetKB = parseInt(document.getElementById("batch-target-size").value);
    if (targetKB && targetKB > 0) {
      const targetBytes = targetKB * 1024;
      
      let compMime = mimeType;
      if (compMime !== "image/jpeg" && compMime !== "image/webp") {
        compMime = "image/jpeg";
        ext = "jpg";
      }

      let scale = 1.0;
      let loopFinalBlob = null;
      let bCanvas = canvas;
      let bW = targetW;
      let bH = targetH;
      
      const initBlob = await new Promise(r => bCanvas.toBlob(r, compMime, 0.9));
      if (initBlob.size <= targetBytes) {
        loopFinalBlob = initBlob;
      } else {
        for (let attempt = 0; attempt < 3; attempt++) {
          let low = 0.01;
          let high = 0.9;
          let bestBlobAtScale = null;

          for (let step = 0; step < 4; step++) {
            const mid = (low + high) / 2;
            const blob = await new Promise(r => bCanvas.toBlob(r, compMime, mid));
            if (blob.size <= targetBytes) {
              bestBlobAtScale = blob;
              low = mid;
              if (blob.size >= targetBytes * 0.85) break;
            } else {
              high = mid;
            }
          }
          if (bestBlobAtScale) {
            loopFinalBlob = bestBlobAtScale;
            break;
          }

          scale *= 0.707;
          bW = Math.max(1, Math.floor(targetW * scale));
          bH = Math.max(1, Math.floor(targetH * scale));
          const tCanvas = document.createElement("canvas");
          tCanvas.width = bW;
          tCanvas.height = bH;
          const tCtx = tCanvas.getContext("2d");
          tCtx.drawImage(bCanvas, 0, 0, bCanvas.width, bCanvas.height, 0, 0, bW, bH);
          bCanvas = tCanvas;
        }
      }
      
      if (!loopFinalBlob) {
        loopFinalBlob = await new Promise(r => bCanvas.toBlob(r, compMime, 0.01));
      }
      finalBlob = loopFinalBlob;
    }
  }
  
  if (!finalBlob) {
    finalBlob = await new Promise(r => canvas.toBlob(r, mimeType));
  }
  
  return {
    blob: finalBlob,
    name: `${baseName}_processed.${ext}`
  };
}

// 12. Retrieve Pasted Image from Command Palette
chrome.storage.local.get(["temp_pasted_image", "temp_pasted_image_name"], (res) => {
  if (res.temp_pasted_image) {
    fetch(res.temp_pasted_image)
      .then(r => r.blob())
      .then(blob => {
        blob.name = res.temp_pasted_image_name || "pasted_image.png";
        handleImageFile(blob);
      })
      .catch(err => console.error("Error loading pasted image:", err));
      
    // Clear storage
    chrome.storage.local.remove(["temp_pasted_image", "temp_pasted_image_name"]);
  }
});
