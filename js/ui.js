// ── Modals ───────────────────────────────────────────────────────────────────

export function openModal(id) {
    document.getElementById(id).classList.add('open');
    // Hide toast so it doesn't overlap the modal
    const t = document.getElementById('toast');
    t.style.display = 'none';
    clearTimeout(window._toastTimer);
}

export function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────

export function toggleSheet() {
    document.getElementById('sheet').classList.toggle('expanded');
}

export function expandSheet() {
    document.getElementById('sheet').classList.add('expanded');
}

// ── Toast ────────────────────────────────────────────────────────────────────

export function showStatus(msg, isErr = false) {
    const t = document.getElementById('toast');
    // Don't show toast if a modal is currently open
    if (document.querySelector('.modal-bg.open')) return;
    t.textContent = msg;
    t.className = isErr ? 'err' : '';
    t.style.display = 'block';
    clearTimeout(window._toastTimer);
    if (!isErr) window._toastTimer = setTimeout(() => t.style.display = 'none', 4000);
}

// ── Loading overlay ──────────────────────────────────────────────────────────

export function showLoading(title, sub = '') {
    const ov   = document.getElementById('loadingOverlay');
    const lock = document.getElementById('uiLock');
    document.getElementById('loTitle').textContent = title;
    document.getElementById('loSub').textContent   = sub;
    document.getElementById('loFill').style.width  = '0%';
    document.getElementById('loCount').textContent = '';
    ov.classList.remove('fade-out');
    ov.classList.add('active');
    lock.classList.add('active');
    // Push sheet below fold during load
    const sheet = document.getElementById('sheet');
    sheet.classList.add('loading-hidden');
    sheet.classList.remove('loading-reveal', 'expanded');
}

export function updateLoading(done, total, sub = '') {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('loFill').style.width  = pct + '%';
    document.getElementById('loCount').textContent = `${done} / ${total} gasolineras`;
    if (sub) document.getElementById('loSub').textContent = sub;
}

export function hideLoading() {
    const ov   = document.getElementById('loadingOverlay');
    const lock = document.getElementById('uiLock');
    ov.classList.add('fade-out');
    lock.classList.remove('active');
    setTimeout(() => ov.classList.remove('active', 'fade-out'), 420);
    // Slide sheet up
    const sheet = document.getElementById('sheet');
    sheet.classList.remove('loading-hidden');
    sheet.classList.add('loading-reveal', 'expanded');
    setTimeout(() => sheet.classList.remove('loading-reveal'), 600);
}
