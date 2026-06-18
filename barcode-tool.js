const editors = {
  serials:     document.getElementById('editorSerials'),
  partnumbers: document.getElementById('editorPartNumbers'),
  eancodes:    document.getElementById('editorEAN'),
  other:       document.getElementById('editorOther'),
};
const scanInput = document.getElementById('scanInput');
const scanHint  = document.getElementById('scanHint');

const EDITOR_LABELS = { serials: 'Serials', partnumbers: 'Part Numbers', eancodes: 'EAN Codes', other: 'Other' };

// ── Classification ─────────────────────────────────────
function classifyLine(t) {
  if (/^\d+$/.test(t))                                                    return 'eancodes';
  if (/^[0-9.\-]+$/.test(t) && /[.\-]/.test(t))                          return 'partnumbers';
  if (/^[A-Za-z0-9]+$/.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t))   return 'serials';
  return 'other';
}

// ── Stats ──────────────────────────────────────────────
function updateStats() {
  const count = ed => ed.value.split('\n').filter(l => l.trim()).length;
  document.getElementById('badgeSerials').textContent     = count(editors.serials);
  document.getElementById('badgePartNumbers').textContent = count(editors.partnumbers);
  document.getElementById('badgeEAN').textContent         = count(editors.eancodes);
  document.getElementById('badgeOther').textContent       = count(editors.other);
}

// ── Helpers ────────────────────────────────────────────
function getLines() {
  return Object.values(editors).flatMap(e => e.value.split('\n'));
}

// Redistribute lines to the correct editor, deduplicating globally.
function setLines(lines) {
  const buckets = { serials: [], partnumbers: [], eancodes: [], other: [] };
  const seen = new Set();
  lines.forEach(l => {
    const t = l.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    buckets[classifyLine(t)].push(t);
  });
  Object.entries(editors).forEach(([type, ed]) => {
    const next = buckets[type].join('\n');
    if (ed.value !== next) {
      ed.value = next;
      if (ed === document.activeElement) {
        if (ed.value && !ed.value.endsWith('\n')) ed.value += '\n';
        ed.selectionStart = ed.selectionEnd = ed.value.length;
      }
    }
  });
  updateStats();
}

function redistributeAll() {
  setLines(getLines());
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Focus / scan indicator ─────────────────────────────
Object.entries(editors).forEach(([type, ed]) => {
  ed.addEventListener('focus', () => {
    Object.values(editors).forEach(e => e.classList.remove('scanning'));
    ed.classList.add('scanning');
    scanHint.classList.add('active');
    scanHint.textContent = `${EDITOR_LABELS[type]} — ready to scan`;
    setTimeout(() => {
      if (ed.value && !ed.value.endsWith('\n')) ed.value += '\n';
      ed.selectionStart = ed.selectionEnd = ed.value.length;
    }, 0);
  });
  ed.addEventListener('blur', () => {
    ed.classList.remove('scanning');
    setTimeout(() => {
      const allInputs = [...Object.values(editors), scanInput];
      if (!allInputs.includes(document.activeElement)) {
        scanHint.classList.remove('active');
        scanHint.textContent = 'Click Scan Input or an editor, then scan';
      }
    }, 0);
  });
});

// ── Scan input ─────────────────────────────────────────
scanInput.addEventListener('focus', () => {
  Object.values(editors).forEach(e => e.classList.remove('scanning'));
  scanInput.classList.add('scanning');
  scanHint.classList.add('active');
  scanHint.textContent = 'Ready to scan';
});

scanInput.addEventListener('blur', () => {
  scanInput.classList.remove('scanning');
  setTimeout(() => {
    const allInputs = [...Object.values(editors), scanInput];
    if (!allInputs.includes(document.activeElement)) {
      scanHint.classList.remove('active');
      scanHint.textContent = 'Click Scan Input or an editor, then scan';
    }
  }, 0);
});

scanInput.addEventListener('input', () => {
  const val = scanInput.value;
  const lastNL = val.lastIndexOf('\n');
  if (lastNL === -1) return; // no complete line yet

  const complete = val.substring(0, lastNL).split('\n');
  const partial  = val.substring(lastNL + 1);

  complete.forEach(line => {
    const t = line.trim();
    if (!t) return;
    const type = classifyLine(t);
    const ed   = editors[type];
    const existing = new Set(ed.value.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean));
    if (!existing.has(t.toLowerCase())) {
      const cur = ed.value.trimEnd();
      ed.value = cur ? cur + '\n' + t : t;
    }
  });

  scanInput.value = partial;
  scanInput.selectionStart = scanInput.selectionEnd = partial.length;
  updateStats();
  scheduleAutoSave();
});

// ── Redistribute debounce (500 ms) ─────────────────────
let redistributeTimer = null;
function scheduleRedistribute() {
  clearTimeout(redistributeTimer);
  redistributeTimer = setTimeout(redistributeAll, 500);
}

// ── Input listeners ────────────────────────────────────
Object.values(editors).forEach(ed => {
  ed.addEventListener('input', () => { updateStats(); scheduleRedistribute(); scheduleAutoSave(); });
});

// ── Operations ─────────────────────────────────────────
function addTrailingTab(type) {
  const ed = editors[type];
  ed.value = ed.value.split('\n').map(l => l.trim() === '' ? l : l + '\t').join('\n');
  updateStats();
  toast('Added trailing tab');
}

function removeTrailingTab(type) {
  const ed = editors[type];
  ed.value = ed.value.split('\n').map(l => l.endsWith('\t') ? l.slice(0, -1) : l).join('\n');
  updateStats();
  toast('Removed trailing tab');
}

// ── Memory (localStorage) ──────────────────────────────
const MEM_KEYS = { serials: 'bt_serials', partnumbers: 'bt_partnumbers', eancodes: 'bt_eancodes' };

function loadMemory(type) {
  try { return JSON.parse(localStorage.getItem(MEM_KEYS[type])) || []; }
  catch { return []; }
}

function saveToMemory(type, lines) {
  const stored = loadMemory(type);
  const existing = new Set(stored.map(l => l.toLowerCase()));
  lines.forEach(l => {
    const t = l.trim();
    if (t && !existing.has(t.toLowerCase())) {
      stored.push(t);
      existing.add(t.toLowerCase());
    }
  });
  localStorage.setItem(MEM_KEYS[type], JSON.stringify(stored));
}

// ── Auto-save (5 s debounce) ───────────────────────────
let autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    ['serials', 'partnumbers', 'eancodes'].forEach(type => {
      const lines = editors[type].value.split('\n').filter(l => l.trim());
      if (lines.length) saveToMemory(type, lines);
    });
  }, 5000);
}

// ── Memory dialog ──────────────────────────────────────
let currentDialogType = null;
const DIALOG_TITLES = { serials: 'Saved Serials', partnumbers: 'Saved Part Numbers', eancodes: 'Saved EAN Codes' };

function openMemoryDialog(type) {
  currentDialogType = type;
  const items = loadMemory(type);

  document.getElementById('dialogTitle').textContent = DIALOG_TITLES[type];
  document.getElementById('selectAll').checked = false;
  document.getElementById('dialogCount').textContent = `${items.length} saved`;

  const list = document.getElementById('dialogList');
  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'dialog-empty';
    empty.textContent = 'Nothing saved yet — barcodes are saved automatically as you type.';
    list.appendChild(empty);
  } else {
    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'dialog-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `di${i}`;
      cb.dataset.value = item;
      const lbl = document.createElement('label');
      lbl.htmlFor = `di${i}`;
      lbl.textContent = item;
      div.appendChild(cb);
      div.appendChild(lbl);
      list.appendChild(div);
    });
  }

  document.getElementById('memoryDialog').classList.add('open');
}

function closeMemoryDialog() {
  document.getElementById('memoryDialog').classList.remove('open');
}

function closeDialogOnBackdrop(e) {
  if (e.target === document.getElementById('memoryDialog')) closeMemoryDialog();
}

function toggleSelectAll(cb) {
  document.querySelectorAll('#dialogList input[type=checkbox]').forEach(c => c.checked = cb.checked);
}

function addSelectedToEditor() {
  const checked = [...document.querySelectorAll('#dialogList input[type=checkbox]:checked')]
    .map(c => c.dataset.value);
  if (!checked.length) { toast('Nothing selected'); return; }

  const target = editors[currentDialogType];
  const existing = new Set(target.value.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean));
  const toAdd = checked.filter(v => !existing.has(v.toLowerCase()));

  const current = target.value.trimEnd();
  target.value = current ? current + '\n' + toAdd.join('\n') : toAdd.join('\n');
  updateStats();
  closeMemoryDialog();
  toast(`Added ${toAdd.length} item${toAdd.length !== 1 ? 's' : ''} to editor`);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMemoryDialog();
});

// ── Per-editor actions ─────────────────────────────────
function copyEditor(type) {
  const content = editors[type].value.split('\n').filter(l => l.trim()).join('\n');
  if (!content) { toast('Nothing to copy'); return; }
  navigator.clipboard.writeText(content).then(() => toast(`${EDITOR_LABELS[type]} copied`));
}

function clearEditor(type) {
  if (!editors[type].value.trim()) return;
  editors[type].value = '';
  updateStats();
  toast(`${EDITOR_LABELS[type]} cleared`);
}

// init
updateStats();
