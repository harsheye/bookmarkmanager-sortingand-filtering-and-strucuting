document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const scrollArea = document.getElementById('scroll-area');
  const contentArea = document.getElementById('content-area');
  const emptyState = document.getElementById('empty-state');
  const statsLabel = document.getElementById('stats-label');
  
  const searchInput = document.getElementById('search-input');
  const filterPills = document.querySelectorAll('.filter-pill');
  const selectGroup = document.getElementById('select-group');
  const selectSort = document.getElementById('select-sort');
  const btnClearAll = document.getElementById('btn-clear-all');
  
  const btnToggleSelect = document.getElementById('btn-toggle-select');
  const selectionToolbar = document.getElementById('selection-toolbar');
  const selectionCount = document.getElementById('selection-count');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDownloadSelected = document.getElementById('btn-download-selected');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const btnCancelSelect = document.getElementById('btn-cancel-select');
  
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbVid = document.getElementById('lb-vid');
  const btnLbClose = document.getElementById('btn-lb-close');
  const btnLbPrev = document.getElementById('btn-lb-prev');
  const btnLbNext = document.getElementById('btn-lb-next');
  const btnLbDownload = document.getElementById('btn-lb-download');
  const btnLbDelete = document.getElementById('btn-lb-delete');
  const lbMeta = document.getElementById('lightbox-meta');

  // State
  let allItems = [];
  let filteredItems = [];
  let layoutElements = []; // { id, type: 'header'|'card', y, height, width?, x?, data, groupKey? }
  let renderedDOM = new Map(); // id -> DOMElement
  let activeObjectUrls = new Map(); // id -> objectUrl (Memory management)
  
  let state = {
    filter: 'all',
    group: 'url',
    sort: 'newest',
    search: '',
    isSelectionMode: false,
    selectedIds: new Set(),
    collapsedGroups: new Set(),
    lightboxIndex: -1, // index in filteredItems
  };

  // Virtualization config
  const V_CONFIG = {
    headerHeight: 60,
    minColWidth: 200,
    gap: 16,
    overscan: 800, // Pre-render pixels outside viewport
  };

  // --- INITIALIZATION ---
  async function loadData() {
    try {
      allItems = await CommandPaletteDB.getScreenshots(10000);
      applyFiltersAndLayout();
    } catch (err) {
      console.error("Failed to load screenshots", err);
      statsLabel.textContent = "Error loading data";
    }
  }

  // --- MEMORY MANAGEMENT ---
  function getObjectUrl(item) {
    if (typeof item.content === 'string') return item.content; // Base64
    if (activeObjectUrls.has(item.id)) return activeObjectUrls.get(item.id);
    
    try {
      // Ensure item.content is a Blob/File
      if (item.content instanceof Blob) {
        const url = URL.createObjectURL(item.content);
        activeObjectUrls.set(item.id, url);
        return url;
      }
    } catch (e) {
      console.warn("Invalid media content for item:", item.id, e);
    }
    return ""; // Fallback
  }
  function cleanupObjectUrls(activeItemIds) {
    const keepIds = new Set(activeItemIds);
    for (const [id, url] of activeObjectUrls.entries()) {
      if (!keepIds.has(id)) {
        URL.revokeObjectURL(url);
        activeObjectUrls.delete(id);
      }
    }
  }

  // --- PIPELINE: Filter -> Sort -> Group -> Layout -> Render ---
  function applyFiltersAndLayout() {
    const q = state.search.toLowerCase();
    
    // 1. Filter
    filteredItems = allItems.filter(item => {
      if (state.filter === 'image' && item.type === 'video') return false;
      if (state.filter === 'video' && item.type !== 'video') return false;
      
      if (q) {
        const urlStr = (item.sourceUrl || '').toLowerCase();
        const titleStr = (item.title || '').toLowerCase();
        if (!urlStr.includes(q) && !titleStr.includes(q)) return false;
      }
      return true;
    });

    // 2. Sort
    filteredItems.sort((a, b) => {
      return state.sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });

    // Removed stats update from here

    if (filteredItems.length === 0) {
      contentArea.style.height = '0px';
      emptyState.style.display = 'flex';
      updateVirtualDOM();
      return;
    }
    emptyState.style.display = 'none';

    // 3. Layout calculation
    layoutElements = [];
    const containerWidth = scrollArea.clientWidth || window.innerWidth - 64; // Fallback
    const columns = Math.max(2, Math.floor((containerWidth - 64 + V_CONFIG.gap) / (V_CONFIG.minColWidth + V_CONFIG.gap)));
    const colWidth = (containerWidth - 64 - (columns - 1) * V_CONFIG.gap) / columns;
    const rowHeight = colWidth * 0.75; // 4:3 aspect ratio

    let currentY = 24; // top padding

    if (state.group === 'none') {
      layoutElements.push({ id: 'header_all', type: 'header', y: currentY, height: 0, hidden: true }); // Dummy
      for (let i = 0; i < filteredItems.length; i++) {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = 32 + col * (colWidth + V_CONFIG.gap);
        const y = currentY + row * (rowHeight + V_CONFIG.gap);
        layoutElements.push({ id: filteredItems[i].id, type: 'card', x, y, width: colWidth, height: rowHeight, data: filteredItems[i] });
      }
      const rows = Math.ceil(filteredItems.length / columns);
      currentY += rows * (rowHeight + V_CONFIG.gap);
    } else {
      // Grouping
      const groupsMap = new Map();
      filteredItems.forEach(item => {
        let key = 'Other';
        if (state.group === 'url') {
          try {
            if (item.sourceUrl) {
              const u = new URL(item.sourceUrl);
              key = u.hostname + (u.pathname.length > 1 ? u.pathname : '');
            }
          } catch(e) { key = item.sourceUrl || 'Unknown'; }
        } else if (state.group === 'date') {
          key = new Date(item.timestamp).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        }
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key).push(item);
      });

      for (const [key, items] of groupsMap.entries()) {
        const isCollapsed = state.collapsedGroups.has(key);
        const imgC = items.filter(i=>i.type!=='video').length;
        const vidC = items.length - imgC;
        
        layoutElements.push({ 
          id: 'group_' + key, 
          type: 'header', 
          y: currentY, 
          height: V_CONFIG.headerHeight, 
          groupKey: key, 
          title: key,
          meta: `${items.length} items · ${imgC} imgs · ${vidC} vids`,
          isCollapsed 
        });
        currentY += V_CONFIG.headerHeight;

        if (!isCollapsed) {
          for (let i = 0; i < items.length; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const x = 32 + col * (colWidth + V_CONFIG.gap);
            const y = currentY + row * (rowHeight + V_CONFIG.gap);
            layoutElements.push({ id: items[i].id, type: 'card', x, y, width: colWidth, height: rowHeight, data: items[i] });
          }
          const rows = Math.ceil(items.length / columns);
          currentY += rows * (rowHeight + V_CONFIG.gap) + 24; // bottom margin
        }
      }
    }

    contentArea.style.height = `${currentY + 100}px`;
    
    // Stats update (moved here to include layoutElements count)
    const imgCount = filteredItems.filter(i => i.type !== 'video').length;
    const vidCount = filteredItems.length - imgCount;
    statsLabel.textContent = `${filteredItems.length} captured · ${imgCount} images · ${vidCount} videos (Layout Elements: ${layoutElements.length}, Height: ${currentY}px)`;
    
    updateVirtualDOM();
  }

  // --- VIRTUAL DOM RENDERER ---
  let scrollTicking = false;
  scrollArea.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        try {
          updateVirtualDOM();
        } finally {
          scrollTicking = false;
        }
      });
      scrollTicking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    applyFiltersAndLayout(); // Recalculate columns on resize
  });

  function updateVirtualDOM() {
    const scrollTop = scrollArea.scrollTop;
    const viewportHeight = scrollArea.clientHeight;
    const visibleRangeStart = scrollTop - V_CONFIG.overscan;
    const visibleRangeEnd = scrollTop + viewportHeight + V_CONFIG.overscan;

    const currentlyVisibleIds = new Set();

    layoutElements.forEach(el => {
      if (el.hidden) return;
      const isVisible = (el.y + el.height >= visibleRangeStart) && (el.y <= visibleRangeEnd);
      
      if (isVisible) {
        currentlyVisibleIds.add(el.id);
        try {
          if (!renderedDOM.has(el.id)) {
            mountElement(el);
          } else {
            updateElement(el, renderedDOM.get(el.id));
          }
        } catch (err) {
          console.error("Failed to render virtual element:", el, err);
        }
      }
    });

    // Unmount out-of-bounds elements
    for (const [id, domNode] of renderedDOM.entries()) {
      if (!currentlyVisibleIds.has(id)) {
        domNode.remove();
        renderedDOM.delete(id);
      }
    }

    // Cleanup ObjectURLs for heavy media items that are far out of view
    // Extract actual item IDs (not headers)
    const activeDataIds = Array.from(currentlyVisibleIds)
      .filter(id => !id.startsWith('group_'))
      .concat(state.lightboxIndex >= 0 ? [filteredItems[state.lightboxIndex].id] : []); // keep lightbox item alive
    
    cleanupObjectUrls(activeDataIds);
  }

  function mountElement(el) {
    let domNode;
    if (el.type === 'header') {
      domNode = document.createElement('div');
      domNode.className = `v-header ${el.isCollapsed ? 'collapsed' : ''}`;
      domNode.style.top = `${el.y}px`;
      domNode.style.height = `${el.height}px`;
      
      domNode.innerHTML = `
        <div class="v-header-left">
          <div class="v-header-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
          <div class="v-header-title">${el.title}</div>
          <div class="v-header-meta">${el.meta}</div>
        </div>
      `;
      domNode.addEventListener('click', () => {
        if (state.collapsedGroups.has(el.groupKey)) state.collapsedGroups.delete(el.groupKey);
        else state.collapsedGroups.add(el.groupKey);
        applyFiltersAndLayout();
      });

    } else if (el.type === 'card') {
      domNode = document.createElement('div');
      domNode.className = `v-card ${state.selectedIds.has(el.id) ? 'selected' : ''}`;
      domNode.style.top = `${el.y}px`;
      domNode.style.left = `${el.x}px`;
      domNode.style.width = `${el.width}px`;
      domNode.style.height = `${el.height}px`;

      const isVideo = el.data.type === 'video';
      
      // Skeleton placeholder initially
      domNode.innerHTML = `
        <div class="v-card-skeleton"></div>
        <div class="v-card-overlay">
          <div class="v-card-top">
            ${isVideo ? '<div class="v-card-type"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Video</div>' : '<div></div>'}
            ${state.isSelectionMode ? '<div class="v-card-select"></div>' : '<div></div>'}
          </div>
          <div class="v-card-actions">
            <button class="icon-btn btn-dl" title="Download"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
            <button class="icon-btn danger btn-del" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
      `;

      // Lazy load actual media using IntersectionObserver pattern combined with virtualization
      // For instant response, since we only mount when near viewport, we load immediately
      const mediaUrl = getObjectUrl(el.data);
      if (isVideo) {
        const vid = document.createElement('video');
        vid.className = 'v-card-media';
        vid.src = mediaUrl;
        vid.muted = true;
        vid.preload = "metadata"; // Don't load full video unless needed
        vid.onloadeddata = () => domNode.querySelector('.v-card-skeleton')?.remove();
        vid.onerror = () => domNode.querySelector('.v-card-skeleton')?.remove();
        domNode.insertBefore(vid, domNode.firstChild);
        
        domNode.addEventListener('mouseenter', () => vid.play().catch(()=>{}));
        domNode.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
      } else {
        const img = document.createElement('img');
        img.className = 'v-card-media';
        img.src = mediaUrl;
        img.onload = () => domNode.querySelector('.v-card-skeleton')?.remove();
        img.onerror = () => domNode.querySelector('.v-card-skeleton')?.remove();
        domNode.insertBefore(img, domNode.firstChild);
      }

      // Events
      domNode.addEventListener('click', (e) => {
        if (e.target.closest('.icon-btn')) return; // ignore action clicks
        if (state.isSelectionMode) {
          if (state.selectedIds.has(el.id)) state.selectedIds.delete(el.id);
          else state.selectedIds.add(el.id);
          updateSelectionToolbar();
          applyFiltersAndLayout(); // quick re-render to update classes
        } else {
          openLightbox(el.data.id);
        }
      });

      domNode.querySelector('.btn-dl').addEventListener('click', () => downloadItem(el.data));
      domNode.querySelector('.btn-del').addEventListener('click', async () => {
        if (confirm("Delete this media?")) {
          await CommandPaletteDB.delete('screenshots', el.id);
          loadData();
        }
      });
    }

    contentArea.appendChild(domNode);
    renderedDOM.set(el.id, domNode);
  }

  function updateElement(el, domNode) {
    domNode.style.top = `${el.y}px`;
    if (el.x !== undefined) domNode.style.left = `${el.x}px`;
    if (el.width !== undefined) domNode.style.width = `${el.width}px`;
    domNode.style.height = `${el.height}px`;
    
    if (el.type === 'card') {
      if (state.isSelectionMode) {
        let selIcon = domNode.querySelector('.v-card-select');
        if (!selIcon) {
          selIcon = document.createElement('div');
          selIcon.className = 'v-card-select';
          domNode.querySelector('.v-card-top').appendChild(selIcon);
        }
      } else {
        domNode.querySelector('.v-card-select')?.remove();
      }

      if (state.selectedIds.has(el.id)) domNode.classList.add('selected');
      else domNode.classList.remove('selected');
    }
  }

  // --- ACTIONS ---
  function downloadItem(item) {
    const a = document.createElement('a');
    a.href = getObjectUrl(item);
    const safeUrl = item.sourceUrl ? item.sourceUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').substring(0, 50) : 'capture';
    a.download = `${safeUrl}_${item.timestamp}.${item.type === 'video' ? 'webm' : 'png'}`;
    a.click();
  }

  // --- LIGHTBOX ---
  function openLightbox(id) {
    state.lightboxIndex = filteredItems.findIndex(i => i.id === id);
    if (state.lightboxIndex === -1) return;
    updateLightboxUI();
    lightbox.classList.add('active');
  }
  
  function updateLightboxUI() {
    if (state.lightboxIndex < 0 || state.lightboxIndex >= filteredItems.length) return;
    const item = filteredItems[state.lightboxIndex];
    const url = getObjectUrl(item);
    
    lbMeta.textContent = `${state.lightboxIndex + 1} of ${filteredItems.length} • ${new Date(item.timestamp).toLocaleString()} • ${item.sourceUrl || ''}`;
    
    if (item.type === 'video') {
      lbImg.style.display = 'none';
      lbImg.src = '';
      lbVid.style.display = 'block';
      lbVid.src = url;
      lbVid.play().catch(()=>{});
    } else {
      lbVid.style.display = 'none';
      lbVid.pause();
      lbVid.src = '';
      lbImg.style.display = 'block';
      lbImg.src = url;
    }
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    lbVid.pause();
    lbVid.src = '';
    lbImg.src = '';
    state.lightboxIndex = -1;
    updateVirtualDOM(); // Allow object URL cleanup
  }

  btnLbClose.addEventListener('click', closeLightbox);
  btnLbPrev.addEventListener('click', () => { if(state.lightboxIndex > 0) { state.lightboxIndex--; updateLightboxUI(); }});
  btnLbNext.addEventListener('click', () => { if(state.lightboxIndex < filteredItems.length-1) { state.lightboxIndex++; updateLightboxUI(); }});
  
  btnLbDownload.addEventListener('click', () => {
    if(state.lightboxIndex >= 0) downloadItem(filteredItems[state.lightboxIndex]);
  });
  
  btnLbDelete.addEventListener('click', async () => {
    if(state.lightboxIndex >= 0 && confirm("Delete this media?")) {
      await CommandPaletteDB.delete('screenshots', filteredItems[state.lightboxIndex].id);
      closeLightbox();
      loadData();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && state.lightboxIndex > 0) { state.lightboxIndex--; updateLightboxUI(); }
    if (e.key === 'ArrowRight' && state.lightboxIndex < filteredItems.length-1) { state.lightboxIndex++; updateLightboxUI(); }
  });

  // --- TOOLBAR BINDINGS ---
  filterPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      filterPills.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      state.filter = e.target.dataset.type;
      applyFiltersAndLayout();
      scrollArea.scrollTop = 0;
    });
  });

  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    applyFiltersAndLayout();
    scrollArea.scrollTop = 0;
  });

  selectGroup.addEventListener('change', (e) => {
    state.group = e.target.value;
    state.collapsedGroups.clear(); // expand all on group change
    applyFiltersAndLayout();
    scrollArea.scrollTop = 0;
  });

  selectSort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    applyFiltersAndLayout();
  });

  btnClearAll.addEventListener('click', async () => {
    if (confirm("Are you sure you want to permanently delete ALL screenshots and videos? This cannot be undone.")) {
      await CommandPaletteDB.clear('screenshots');
      loadData();
    }
  });

  // --- SELECTION MODE ---
  function updateSelectionToolbar() {
    selectionCount.textContent = `${state.selectedIds.size} selected`;
    if (state.isSelectionMode) {
      selectionToolbar.classList.add('active');
    } else {
      selectionToolbar.classList.remove('active');
      state.selectedIds.clear();
    }
  }

  btnToggleSelect.addEventListener('click', () => {
    state.isSelectionMode = !state.isSelectionMode;
    if (state.isSelectionMode) {
      btnToggleSelect.classList.add('active');
      btnToggleSelect.style.background = 'var(--primary)';
    } else {
      btnToggleSelect.classList.remove('active');
      btnToggleSelect.style.background = '';
    }
    updateSelectionToolbar();
    applyFiltersAndLayout();
  });

  btnCancelSelect.addEventListener('click', () => {
    state.isSelectionMode = false;
    btnToggleSelect.classList.remove('active');
    btnToggleSelect.style.background = '';
    updateSelectionToolbar();
    applyFiltersAndLayout();
  });

  btnSelectAll.addEventListener('click', () => {
    filteredItems.forEach(item => state.selectedIds.add(item.id));
    updateSelectionToolbar();
    applyFiltersAndLayout();
  });

  btnDownloadSelected.addEventListener('click', () => {
    const itemsToDl = filteredItems.filter(i => state.selectedIds.has(i.id));
    if (itemsToDl.length === 0) return;
    
    if (itemsToDl.length === 1) {
      downloadItem(itemsToDl[0]);
    } else {
      if (typeof JSZip !== 'undefined') {
        const overlay = document.getElementById('zip-progress-overlay');
        const statusEl = document.getElementById('zip-status');
        const barFill = document.getElementById('zip-bar-fill');
        const percentEl = document.getElementById('zip-percent');

        // Show overlay
        statusEl.textContent = `Packing ${itemsToDl.length} files…`;
        barFill.style.width = '0%';
        percentEl.textContent = '0%';
        overlay.classList.add('active');

        const zip = new JSZip();
        for (const item of itemsToDl) {
          const safeUrl = item.sourceUrl ? item.sourceUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').substring(0, 50) : 'capture';
          const ext = item.type === 'video' ? 'webm' : 'png';
          let filename = `${safeUrl}_${item.timestamp}.${ext}`;
          
          // Ensure unique filenames if there are identical timestamps
          let counter = 1;
          while (zip.file(filename)) {
             filename = `${safeUrl}_${item.timestamp}_${counter}.${ext}`;
             counter++;
          }
          
          if (typeof item.content === 'string') {
            const base64Data = item.content.split(',')[1] || item.content;
            zip.file(filename, base64Data, {base64: true});
          } else if (item.content instanceof Blob) {
            zip.file(filename, item.content);
          }
        }
        
        zip.generateAsync({type: "blob"}, (metadata) => {
          const pct = Math.round(metadata.percent);
          barFill.style.width = pct + '%';
          percentEl.textContent = pct + '%';
          if (pct < 100) {
            statusEl.textContent = `Compressing… ${pct}%`;
          } else {
            statusEl.textContent = 'Finalizing…';
          }
        }).then(content => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(content);
          a.download = `gallery_download_${Date.now()}.zip`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);

          // Hide overlay
          barFill.style.width = '100%';
          percentEl.textContent = '100%';
          statusEl.textContent = 'Done!';
          setTimeout(() => overlay.classList.remove('active'), 600);
        }).catch(e => {
          console.error("Zip generation failed", e);
          overlay.classList.remove('active');
          alert("Failed to create zip file");
        });
      } else {
        // Fallback if JSZip is not loaded
        let i = 0;
        const interval = setInterval(() => {
          downloadItem(itemsToDl[i]);
          i++;
          if (i >= itemsToDl.length) clearInterval(interval);
        }, 300);
      }
    }
    
    state.isSelectionMode = false;
    updateSelectionToolbar();
    applyFiltersAndLayout();
  });

  btnDeleteSelected.addEventListener('click', async () => {
    const size = state.selectedIds.size;
    if (size === 0) return;
    if (confirm(`Delete ${size} selected item${size > 1 ? 's' : ''}?`)) {
      const overlay = document.getElementById('zip-progress-overlay');
      const statusEl = document.getElementById('zip-status');
      const barFill = document.getElementById('zip-bar-fill');
      const percentEl = document.getElementById('zip-percent');
      const titleEl = overlay.querySelector('h3');

      titleEl.textContent = 'Deleting files';
      statusEl.textContent = `Deleting 0 of ${size}…`;
      barFill.style.width = '0%';
      percentEl.textContent = '0%';
      overlay.classList.add('active');

      let done = 0;
      for (const id of state.selectedIds) {
        await CommandPaletteDB.delete('screenshots', id);
        done++;
        const pct = Math.round((done / size) * 100);
        barFill.style.width = pct + '%';
        percentEl.textContent = pct + '%';
        statusEl.textContent = `Deleting ${done} of ${size}…`;
      }

      statusEl.textContent = 'Done!';
      barFill.style.width = '100%';
      percentEl.textContent = '100%';
      titleEl.textContent = 'Creating ZIP file'; // reset for next use

      setTimeout(() => {
        overlay.classList.remove('active');
        state.isSelectionMode = false;
        updateSelectionToolbar();
        loadData();
      }, 500);
    }
  });

  // BOOTSTRAP
  loadData();
});
