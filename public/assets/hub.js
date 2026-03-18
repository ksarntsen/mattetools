const audience = document.body.dataset.audience || 'student';
const grid = document.getElementById('hubGrid');
const statusLine = document.getElementById('hubStatus');
const refreshButton = document.getElementById('refreshHubButton');

function setStatus(message) {
  statusLine.textContent = message;
}

function createEmptyState(message) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.textContent = message;
  return box;
}

function createToolCard(tool) {
  const card = document.createElement('article');
  card.className = 'tool-card';

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
  const sourceBadge = document.createElement('span');
  sourceBadge.className = 'badge';
  sourceBadge.textContent = tool.sourceType === 'upload' ? 'Opplastet HTML' : 'Ekstern lenke';
  meta.appendChild(sourceBadge);

  const actionRow = document.createElement('div');
  actionRow.className = 'button-row';
  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = tool.launchUrl;
  link.textContent = 'Åpne';
  if (tool.sourceType === 'link') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  actionRow.appendChild(link);

  body.append(title, desc, meta, actionRow);
  card.append(thumbWrap, body);
  return card;
}

async function loadHub() {
  setStatus('Laster…');
  grid.replaceChildren();

  try {
    const response = await fetch(`/api/public-tools?audience=${encodeURIComponent(audience)}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Klarte ikke å hente verktøy.');
    }

    const tools = payload.tools || [];
    if (tools.length === 0) {
      setStatus('Ingen verktøy er slått på.');
      grid.appendChild(createEmptyState('Ingen verktøy er tilgjengelige akkurat nå.'));
      return;
    }

    setStatus(`${tools.length} verktøy`);
    tools.forEach((tool) => grid.appendChild(createToolCard(tool)));
  } catch (error) {
    console.error(error);
    setStatus('Kunne ikke laste verktøy.');
    grid.appendChild(createEmptyState(error.message || 'En feil oppstod.'));
  }
}

refreshButton?.addEventListener('click', loadHub);
loadHub();
