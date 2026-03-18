const SESSION_KEY = 'mattetools-admin-password';

const authForm = document.getElementById('authForm');
const passwordInput = document.getElementById('adminPassword');
const logoutButton = document.getElementById('logoutButton');
const reloadAdminButton = document.getElementById('reloadAdminButton');
const adminStatus = document.getElementById('adminStatus');
const toolCount = document.getElementById('toolCount');
const adminGrid = document.getElementById('adminGrid');
const editorTitle = document.getElementById('editorTitle');
const toolForm = document.getElementById('toolForm');
const editingIdInput = document.getElementById('editingId');
const resetToolButton = document.getElementById('resetToolButton');
const sourceTypeInputs = Array.from(document.querySelectorAll('input[name="sourceType"]'));
const linkFields = document.getElementById('linkFields');
const uploadFields = document.getElementById('uploadFields');
const externalUrlInput = document.getElementById('externalUrl');
const htmlFileInput = document.getElementById('htmlFile');
const thumbnailFileInput = document.getElementById('thumbnailFile');
const thumbnailPreview = document.getElementById('thumbnailPreview');
const existingHtmlNote = document.getElementById('existingHtmlNote');

let tools = [];
let currentPassword = sessionStorage.getItem(SESSION_KEY) || '';
let currentEditTool = null;

passwordInput.value = currentPassword;

function setAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? '#b42318' : '';
}

function activeSourceType() {
  return sourceTypeInputs.find((input) => input.checked)?.value || 'link';
}

function updateSourceFields() {
  const type = activeSourceType();
  linkFields.classList.toggle('hidden', type !== 'link');
  uploadFields.classList.toggle('hidden', type !== 'upload');
}

function getAuthHeaders() {
  if (!currentPassword) {
    throw new Error('Manglende admin-passord i økten.');
  }
  return {
    'x-admin-password': currentPassword,
    'content-type': 'application/json'
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Ugyldig svar fra server.' }));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Forespørselen feilet.');
  }
  return payload;
}

function resetForm() {
  currentEditTool = null;
  editingIdInput.value = '';
  editorTitle.textContent = 'Legg til verktøy';
  toolForm.reset();
  document.querySelector('input[name="sourceType"][value="link"]').checked = true;
  updateSourceFields();
  thumbnailPreview.removeAttribute('src');
  existingHtmlNote.textContent = '';
  existingHtmlNote.classList.add('hidden');
  document.getElementById('sortOrder').value = '0';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Kunne ikke lese filen.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Kunne ikke lese HTML-filen.'));
    reader.readAsText(file, 'utf-8');
  });
}

function createBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = text;
  return badge;
}

function createToggle(labelText, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'toggle-box';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked, input));

  const span = document.createElement('span');
  span.textContent = labelText;

  label.append(input, span);
  return label;
}

async function refreshTools() {
  if (!currentPassword) {
    setAdminStatus('Lagre admin-passord først.', true);
    adminGrid.replaceChildren();
    return;
  }

  setAdminStatus('Laster verktøy…');
  adminGrid.replaceChildren();

  try {
    const payload = await api('/api/admin/tools', {
      headers: getAuthHeaders()
    });
    tools = payload.tools || [];
    renderTools();
    setAdminStatus('Verktøy lastet inn.');
  } catch (error) {
    console.error(error);
    tools = [];
    renderTools();
    setAdminStatus(error.message, true);
  }
}

function renderTools() {
  adminGrid.replaceChildren();
  toolCount.textContent = `${tools.length} verktøy`;

  if (tools.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Ingen verktøy i databasen.';
    adminGrid.appendChild(empty);
    return;
  }

  tools.forEach((tool) => {
    const card = document.createElement('article');
    card.className = 'tool-card admin-card';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'tool-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'tool-thumb';
    img.src = tool.thumbnailUrl;
    img.alt = tool.title;
    thumbWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'tool-body';

    const title = document.createElement('h3');
    title.className = 'tool-title';
    title.textContent = tool.title;

    const desc = document.createElement('p');
    desc.className = 'tool-desc';
    desc.textContent = tool.description || 'Ingen beskrivelse.';

    const meta = document.createElement('div');
    meta.className = 'tool-meta';
    meta.append(
      createBadge(tool.sourceType === 'upload' ? 'Opplastet HTML' : 'Ekstern lenke'),
      createBadge(`Slug: ${tool.slug}`),
      createBadge(`Rekkefølge: ${tool.sortOrder}`)
    );

    const inlineControls = document.createElement('div');
    inlineControls.className = 'inline-controls';

    const toggles = document.createElement('div');
    toggles.className = 'toggle-row';
    toggles.append(
      createToggle('Elevside', tool.enabledStudent, async (checked, input) => {
        input.disabled = true;
        try {
          await api(`/api/admin/tools/${tool.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ enabledStudent: checked })
          });
          tool.enabledStudent = checked;
          setAdminStatus(`Oppdatert elevbryter for ${tool.title}.`);
        } catch (error) {
          input.checked = !checked;
          setAdminStatus(error.message, true);
        } finally {
          input.disabled = false;
        }
      }),
      createToggle('Lærerside', tool.enabledTeacher, async (checked, input) => {
        input.disabled = true;
        try {
          await api(`/api/admin/tools/${tool.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ enabledTeacher: checked })
          });
          tool.enabledTeacher = checked;
          setAdminStatus(`Oppdatert lærerbryter for ${tool.title}.`);
        } catch (error) {
          input.checked = !checked;
          setAdminStatus(error.message, true);
        } finally {
          input.disabled = false;
        }
      })
    );

    const orderWrap = document.createElement('label');
    orderWrap.innerHTML = '<span>Rekkefølge</span>';
    const orderInput = document.createElement('input');
    orderInput.type = 'number';
    orderInput.value = String(tool.sortOrder || 0);
    orderInput.addEventListener('change', async () => {
      orderInput.disabled = true;
      try {
        const nextOrder = Number.parseInt(orderInput.value, 10) || 0;
        await api(`/api/admin/tools/${tool.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ sortOrder: nextOrder })
        });
        tool.sortOrder = nextOrder;
        setAdminStatus(`Oppdatert rekkefølge for ${tool.title}.`);
        tools.sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title, 'no'));
        renderTools();
      } catch (error) {
        setAdminStatus(error.message, true);
      } finally {
        orderInput.disabled = false;
      }
    });
    orderWrap.appendChild(orderInput);

    inlineControls.append(toggles, orderWrap);

    const actions = document.createElement('div');
    actions.className = 'button-row';

    const open = document.createElement('a');
    open.className = 'card-link';
    open.href = tool.launchUrl;
    open.textContent = 'Åpne';
    if (tool.sourceType === 'link') {
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
    }

    const edit = document.createElement('button');
    edit.className = 'ghost-button';
    edit.type = 'button';
    edit.textContent = 'Rediger';
    edit.addEventListener('click', () => loadToolIntoForm(tool));

    const del = document.createElement('button');
    del.className = 'danger-button';
    del.type = 'button';
    del.textContent = 'Slett';
    del.addEventListener('click', async () => {
      const confirmed = window.confirm(`Slette "${tool.title}"?`);
      if (!confirmed) return;
      del.disabled = true;
      try {
        await api(`/api/admin/tools/${tool.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (editingIdInput.value === String(tool.id)) {
          resetForm();
        }
        tools = tools.filter((item) => item.id !== tool.id);
        renderTools();
        setAdminStatus(`Slettet ${tool.title}.`);
      } catch (error) {
        setAdminStatus(error.message, true);
      } finally {
        del.disabled = false;
      }
    });

    actions.append(open, edit, del);
    body.append(title, desc, meta, inlineControls, actions);
    card.append(thumbWrap, body);
    adminGrid.appendChild(card);
  });
}

function loadToolIntoForm(tool) {
  currentEditTool = tool;
  editingIdInput.value = String(tool.id);
  editorTitle.textContent = `Rediger: ${tool.title}`;
  document.getElementById('title').value = tool.title || '';
  document.getElementById('description').value = tool.description || '';
  document.getElementById('sortOrder').value = String(tool.sortOrder || 0);
  document.getElementById('enabledStudent').checked = !!tool.enabledStudent;
  document.getElementById('enabledTeacher').checked = !!tool.enabledTeacher;
  thumbnailPreview.src = tool.thumbnailUrl;

  const sourceValue = tool.sourceType === 'upload' ? 'upload' : 'link';
  document.querySelector(`input[name="sourceType"][value="${sourceValue}"]`).checked = true;
  updateSourceFields();

  externalUrlInput.value = tool.externalUrl || '';
  htmlFileInput.value = '';
  thumbnailFileInput.value = '';

  if (tool.sourceType === 'upload') {
    existingHtmlNote.textContent = tool.htmlFilename
      ? `Beholder nåværende HTML-fil hvis du ikke velger en ny. Nåværende fil: ${tool.htmlFilename}`
      : 'Beholder nåværende HTML-fil hvis du ikke velger en ny.';
    existingHtmlNote.classList.remove('hidden');
  } else {
    existingHtmlNote.classList.add('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleToolSubmit(event) {
  event.preventDefault();

  try {
    const sourceType = activeSourceType();
    const editingId = editingIdInput.value;
    const thumbnailFile = thumbnailFileInput.files?.[0] || null;
    const htmlFile = htmlFileInput.files?.[0] || null;

    const body = {
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      sourceType,
      sortOrder: document.getElementById('sortOrder').value,
      enabledStudent: document.getElementById('enabledStudent').checked,
      enabledTeacher: document.getElementById('enabledTeacher').checked
    };

    if (thumbnailFile) {
      body.thumbnailDataUrl = await readFileAsDataUrl(thumbnailFile);
    }

    if (sourceType === 'link') {
      body.externalUrl = externalUrlInput.value.trim();
    } else {
      if (htmlFile) {
        body.htmlContent = await readFileAsText(htmlFile);
        body.htmlFilename = htmlFile.name;
      }
    }

    const isEditing = Boolean(editingId);
    const path = isEditing ? `/api/admin/tools/${editingId}` : '/api/admin/tools';
    const method = isEditing ? 'PATCH' : 'POST';

    await api(path, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });

    setAdminStatus(isEditing ? 'Verktøy oppdatert.' : 'Verktøy lagt til.');
    resetForm();
    await refreshTools();
  } catch (error) {
    console.error(error);
    setAdminStatus(error.message, true);
  }
}

thumbnailFileInput.addEventListener('change', async () => {
  const file = thumbnailFileInput.files?.[0];
  if (!file) return;
  try {
    thumbnailPreview.src = await readFileAsDataUrl(file);
  } catch (error) {
    setAdminStatus(error.message, true);
  }
});

sourceTypeInputs.forEach((input) => input.addEventListener('change', updateSourceFields));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  currentPassword = passwordInput.value;
  sessionStorage.setItem(SESSION_KEY, currentPassword);
  setAdminStatus('Økt lagret. Laster verktøy…');
  await refreshTools();
});

logoutButton.addEventListener('click', () => {
  currentPassword = '';
  sessionStorage.removeItem(SESSION_KEY);
  passwordInput.value = '';
  tools = [];
  renderTools();
  setAdminStatus('Økten er tømt.');
});

reloadAdminButton.addEventListener('click', refreshTools);
resetToolButton.addEventListener('click', resetForm);
toolForm.addEventListener('submit', handleToolSubmit);

updateSourceFields();
if (currentPassword) {
  refreshTools();
}
