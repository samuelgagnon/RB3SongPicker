const state = {
  currentPage: 'songs',
  songs: [],
  songLists: [],
  selectedListId: '',
  searchText: '',
  sortBy: 'title',
  sortOrder: 'asc',
  editingList: null,
  showSongListManagement: false,
  saving: false,
  loading: false
};

const elements = {
  xboxIp: document.getElementById('xboxIp'),
  xboxPort: document.getElementById('xboxPort'),
  saveConfigButton: document.getElementById('saveConfigButton'),
  refreshButton: document.getElementById('refreshButton'),
  showListManagement: document.getElementById('showListManagement'),
  qrImage: document.getElementById('qrImage'),
  searchInput: document.getElementById('searchInput'),
  randomButton: document.getElementById('randomButton'),
  randomMenuButton: document.getElementById('randomMenuButton'),
  randomMenu: document.getElementById('randomMenu'),
  randomUnpopularButton: document.getElementById('randomUnpopularButton'),
  randomPopularButton: document.getElementById('randomPopularButton'),
  songListSelect: document.getElementById('songListSelect'),
  newListButton: document.getElementById('newListButton'),
  editListButton: document.getElementById('editListButton'),
  deleteListButton: document.getElementById('deleteListButton'),
  listEditor: document.getElementById('listEditor'),
  songTableWrapper: document.getElementById('songTableWrapper'),
  gotoControls: document.getElementById('gotoControls'),
  gotoToggle: document.getElementById('gotoToggle'),
  gotoTop: document.getElementById('gotoTop'),
  gotoUp: document.getElementById('gotoUp'),
  gotoDown: document.getElementById('gotoDown'),
  listName: document.getElementById('listName'),
  saveListButton: document.getElementById('saveListButton'),
  cancelListButton: document.getElementById('cancelListButton'),
  sortButtons: document.getElementById('sortButtons'),
  songsTableBody: document.querySelector('#songsTable tbody'),
  summaryText: document.getElementById('summaryText'),
  managementActions: document.getElementById('managementActions'),
  pageButtons: {
    songs: document.getElementById('songsPageButton'),
    admin: document.getElementById('adminPageButton')
  },
  pages: {
    songs: document.getElementById('songsPage'),
    admin: document.getElementById('adminPage')
  },
  tableHeaders: Array.from(document.querySelectorAll('th.sortable'))
};

function setStatus(message, isError = false) {
  const prefix = isError ? '⚠️ ' : '✨ ';
  elements.summaryText.textContent = `${prefix}${message}`;
  elements.summaryText.style.color = isError ? '#fca5a5' : '#a5f3fc';
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const message = errorData?.message || errorData?.error || res.statusText;
    throw new Error(message || 'Request failed');
  }
  return res.json();
}

function renderQrImage() {
  if (!elements.qrImage) return;
  const url = window.location.href;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
  elements.qrImage.src = qrUrl;
  elements.qrImage.alt = `Scan to open ${url}`;
}

async function loadConfig() {
  try {
    const config = await apiFetch('/api/config');
    elements.xboxIp.value = config.xboxIp || '';
    elements.xboxPort.value = config.xboxPort || '';
  } catch (error) {
    setStatus(`Cannot load config: ${error.message}`, true);
  }
}

async function saveConfig() {
  try {
    const xboxIp = elements.xboxIp.value.trim();
    const xboxPort = Number(elements.xboxPort.value.trim()) || 21070;
    await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xboxIp, xboxPort })
    });
    setStatus('Server configuration saved.');
  } catch (error) {
    setStatus(`Cannot save config: ${error.message}`, true);
  }
}

async function loadSongLists() {
  try {
    const data = await apiFetch('/api/songlists');
    state.songLists = data.lists || [];
    renderSongListOptions();
  } catch (error) {
    setStatus(`Cannot load song lists: ${error.message}`, true);
  }
}

async function loadSettings() {
  try {
    const data = await apiFetch('/api/settings');
    state.showSongListManagement = Boolean(data.showSongListManagement);
    elements.showListManagement.checked = state.showSongListManagement;
    renderSongListOptions();
  } catch (error) {
    setStatus(`Cannot load settings: ${error.message}`, true);
  }
}

async function saveSettings() {
  try {
    const payload = { showSongListManagement: elements.showListManagement.checked };
    const data = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.showSongListManagement = Boolean(data.showSongListManagement);
    renderSongListOptions();
    setStatus('Song list management setting saved.');
  } catch (error) {
    setStatus(`Cannot save settings: ${error.message}`, true);
  }
}

function renderSongListOptions() {
  elements.songListSelect.innerHTML = '<option value="">All songs</option>';
  for (const list of state.songLists) {
    const option = document.createElement('option');
    option.value = list.id;
    option.textContent = `${list.name} (${list.songCount})`;
    elements.songListSelect.append(option);
  }
  elements.songListSelect.value = state.selectedListId;
  const hasSelected = state.songLists.some((list) => String(list.id) === state.selectedListId);
  elements.editListButton.disabled = !hasSelected;
  elements.deleteListButton.disabled = !hasSelected;
  elements.managementActions.classList.toggle('hidden', !state.showSongListManagement);
  if (!state.showSongListManagement) {
    elements.listEditor.classList.add('hidden');
    state.editingList = null;
  }
}

async function loadSongs() {
  state.loading = true;
  try {
    const params = new URLSearchParams();
    if (state.searchText) params.set('search', state.searchText);
    params.set('sort', state.sortBy);
    params.set('order', state.sortOrder);
    if (state.selectedListId && !state.editingList) params.set('listId', state.selectedListId);
    const data = await apiFetch(`/api/songs?${params.toString()}`);
    state.songs = data.songs || [];
    renderSongTable();
    const listMessage = state.editingList ? ' (editing list, full library shown)' : state.selectedListId ? ' from selected song list' : '';
    setStatus(`Showing ${state.songs.length} songs${listMessage}.`);
  } catch (error) {
    setStatus(`Cannot load songs: ${error.message}`, true);
  } finally {
    state.loading = false;
  }
}

function renderSongTable() {
  elements.songsTableBody.innerHTML = '';
  if (!state.songs.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="5" class="empty-row">No songs found.</td>';
    elements.songsTableBody.append(emptyRow);
    updateGotoControls();
    return;
  }

  const editingSet = new Set(state.editingList?.items || []);
  const inEditMode = Boolean(state.editingList);

  for (const song of state.songs) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="title-cell"><strong>${song.title || '—'}</strong>
        <div class="song-meta">
          <div class="song-meta-primary">${song.artist || '—'}</div>
          <div class="song-meta-secondary">${song.album || '—'} | ${song.origin || '—'}</div>
        </div>
      </td>
      <td class="artist-cell">${song.artist || '—'}</td>
      <td class="album-cell">${song.album || '—'}</td>
      <td class="origin-cell">${song.origin || '—'}</td>
      <td class="action-cell"></td>
    `;

    const actionCell = row.querySelector('.action-cell');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = inEditMode ? 'small-button secondary' : 'small-button primary';

    if (inEditMode) {
      const selected = editingSet.has(song.shortname);
      button.textContent = selected ? '−' : '+';
      button.title = selected ? 'Remove from song list' : 'Add to song list';
      button.addEventListener('click', () => toggleSongInList(song.shortname));
    } else {
      button.textContent = 'Pick';
      button.addEventListener('click', () => pickSong(song.shortname));
    }
    actionCell.append(button);
    elements.songsTableBody.append(row);
  }
  updateGotoControls();
}

function getSortKey(song) {
  return String(song[state.sortBy] || '').trim().toUpperCase();
}

function getSongGroup(value) {
  const letter = String(value || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : '#';
}

function getSongGroupList() {
  const groups = [];
  for (const song of state.songs) {
    const group = getSongGroup(getSortKey(song));
    if (!groups.includes(group)) {
      groups.push(group);
    }
  }
  return groups;
}

function getCurrentTopGroup() {
  const rows = Array.from(elements.songsTableBody.children);
  const visibleRows = rows
    .map((row, index) => ({ row, index, rect: row.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);

  if (!visibleRows.length) {
    return state.songs.length ? getSongGroup(getSortKey(state.songs[0])) : null;
  }

  const fullyVisibleRows = visibleRows.filter(({ rect }) => rect.top >= 0);
  const chosenRow = fullyVisibleRows.length
    ? fullyVisibleRows.reduce((best, current) => (current.rect.top < best.rect.top ? current : best))
    : visibleRows.reduce((best, current) => (current.rect.top < best.rect.top ? current : best));

  return getSongGroup(getSortKey(state.songs[chosenRow.index]));
}

function scrollToSongIndex(index) {
  const row = elements.songsTableBody.children[index];
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToTop() {
  scrollToSongIndex(0);
}

function navigateGroup(direction) {
  if (!state.songs.length) return;
  const groups = getSongGroupList();
  if (!groups.length) return;
  const current = getCurrentTopGroup();
  let currentIndex = groups.indexOf(current);
  if (currentIndex < 0) {
    currentIndex = 0;
  }
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= groups.length) return;
  const targetGroup = groups[targetIndex];
  const nextIndex = state.songs.findIndex((song) => getSongGroup(getSortKey(song)) === targetGroup);
  if (nextIndex >= 0) {
    scrollToSongIndex(nextIndex);
  }
}

function updateGotoControls() {
  const shouldShow = state.songs.length > 1;
  elements.gotoControls.classList.toggle('hidden', !shouldShow);
}

function updateGotoDefaultState() {
  if (!elements.gotoControls) return;
  if (window.innerWidth <= 760) {
    elements.gotoControls.classList.remove('collapsed');
    elements.gotoControls.classList.add('expanded');
  } else {
    elements.gotoControls.classList.add('collapsed');
    elements.gotoControls.classList.remove('expanded');
  }
}

function toggleGotoNavigation() {
  if (!elements.gotoControls) return;
  elements.gotoControls.classList.toggle('collapsed');
  elements.gotoControls.classList.toggle('expanded');
}

function updateSortHeaders() {
  elements.tableHeaders.forEach((header) => {
    const sortKey = header.dataset.sort;
    const icon = header.querySelector('.sort-icon');
    if (sortKey === state.sortBy) {
      icon.textContent = state.sortOrder === 'asc' ? '▲' : '▼';
      header.classList.add('active');
    } else {
      icon.textContent = '';
      header.classList.remove('active');
    }
  });
  if (elements.sortButtons) {
    const buttons = Array.from(elements.sortButtons.querySelectorAll('button'));
    buttons.forEach((button) => {
      button.classList.toggle('active', button.dataset.sort === state.sortBy);
    });
  }
}

function toggleRandomMenu() {
  const visible = elements.randomMenu.classList.toggle('hidden');
  elements.randomMenuButton.setAttribute('aria-expanded', String(!visible));
}

function closeRandomMenu() {
  if (!elements.randomMenu.classList.contains('hidden')) {
    elements.randomMenu.classList.add('hidden');
    elements.randomMenuButton.setAttribute('aria-expanded', 'false');
  }
}

function pickRandom(type) {
  if (!state.songs.length) {
    setStatus('No songs available for random selection.', true);
    return;
  }

  let candidates = [...state.songs];
  if (type === 'unpopular') {
    const minPicks = Math.min(...candidates.map((song) => song.picks || 0));
    candidates = candidates.filter((song) => (song.picks || 0) === minPicks);
  } else if (type === 'popular') {
    candidates = candidates.filter((song) => (song.picks || 0) > 0);
    if (!candidates.length) {
      setStatus('No popular songs have been picked yet.', true);
      return;
    }
    const maxPicks = Math.max(...candidates.map((song) => song.picks || 0));
    candidates = candidates.filter((song) => (song.picks || 0) === maxPicks);
  }

  if (!candidates.length) {
    setStatus('No songs match the selected random criteria.', true);
    return;
  }

  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  closeRandomMenu();
  pickSong(choice.shortname);
}

function toggleSongInList(shortname) {
  if (!state.editingList) return;
  const items = new Set(state.editingList.items || []);
  if (items.has(shortname)) {
    items.delete(shortname);
  } else {
    items.add(shortname);
  }
  state.editingList.items = Array.from(items);
  renderSongTable();
}

async function refreshLibrary() {
  try {
    setStatus('Refreshing library from Xbox...');
    await apiFetch('/api/songs/refresh', { method: 'POST' });
    await loadSongLists();
    await loadSongs();
    setStatus('Library refreshed successfully.');
  } catch (error) {
    setStatus(`Refresh failed: ${error.message}`, true);
  }
}

async function pickSong(shortname) {
  try {
    setStatus(`Sending pick command for ${shortname}...`);
    const result = await apiFetch(`/api/songs/${encodeURIComponent(shortname)}/pick`, { method: 'POST' });
    const song = state.songs.find((item) => item.shortname === shortname);
    if (song) song.picks = result.count;
    renderSongTable();
    setStatus(`Song picked: ${shortname} (picked ${result.count} times).`);
  } catch (error) {
    setStatus(`Pick failed: ${error.message}`, true);
  }
}

async function beginNewList() {
  state.editingList = { id: null, name: '', items: [] };
  state.listMode = true;
  elements.listName.value = '';
  elements.listEditor.classList.remove('hidden');
  setStatus('Song list creation mode enabled. Use + / − buttons to choose songs.');
  await loadSongs();
}

async function beginEditList() {
  if (!state.selectedListId) return;
  try {
    const data = await apiFetch(`/api/songlists/${state.selectedListId}`);
    state.editingList = { id: data.id, name: data.name, items: data.items || [] };
    elements.listName.value = data.name;
    elements.listEditor.classList.remove('hidden');
    setStatus('Editing song list. Use + / − buttons to update membership.');
    await loadSongs();
  } catch (error) {
    setStatus(`Cannot edit list: ${error.message}`, true);
  }
}

async function saveSongList() {
  if (!state.editingList) return;
  const name = elements.listName.value.trim();
  if (!name) {
    setStatus('Song list name is required.', true);
    return;
  }

  try {
    const body = { name, items: state.editingList.items };
    if (state.editingList.id) {
      await apiFetch(`/api/songlists/${state.editingList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus('Song list updated.');
    } else {
      await apiFetch('/api/songlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus('Song list created.');
    }
    state.editingList = null;
    elements.listEditor.classList.add('hidden');
    await loadSongLists();
    await loadSongs();
  } catch (error) {
    setStatus(`Cannot save list: ${error.message}`, true);
  }
}

async function deleteSongList() {
  if (!state.selectedListId) return;
  if (!confirm('Delete the selected song list?')) return;
  const listId = state.selectedListId;
  try {
    await apiFetch(`/api/songlists/${listId}`, { method: 'DELETE' });
    state.selectedListId = '';
    await loadSongLists();
    await loadSongs();
    setStatus('Song list deleted.');
  } catch (error) {
    setStatus(`Cannot delete list: ${error.message}`, true);
  }
}

function cancelSongList() {
  state.editingList = null;
  elements.listEditor.classList.add('hidden');
  setStatus('Song list editing cancelled.');
  loadSongs();
}

function setPage(page) {
  state.currentPage = page;
  elements.pages.songs.classList.toggle('hidden', page !== 'songs');
  elements.pages.admin.classList.toggle('hidden', page !== 'admin');
  elements.pageButtons.songs.classList.toggle('active', page === 'songs');
  elements.pageButtons.admin.classList.toggle('active', page === 'admin');
  elements.pageButtons.admin.style.display = page === 'songs' ? 'inline-flex' : 'none';
  elements.pageButtons.songs.style.display = page === 'admin' ? 'inline-flex' : 'none';
  if (page === 'songs') {
    loadSongs();
  } else if (page === 'admin') {
    loadConfig();
    loadSettings();
  }
}

function attachEvents() {
  elements.saveConfigButton.addEventListener('click', saveConfig);
  elements.refreshButton.addEventListener('click', refreshLibrary);
  elements.showListManagement.addEventListener('change', saveSettings);
  elements.gotoTop.addEventListener('click', scrollToTop);
  elements.gotoUp.addEventListener('click', () => navigateGroup(-1));
  elements.gotoDown.addEventListener('click', () => navigateGroup(1));
  elements.pageButtons.songs.addEventListener('click', () => setPage('songs'));
  elements.pageButtons.admin.addEventListener('click', () => setPage('admin'));
  elements.searchInput.addEventListener('input', async (event) => {
    state.searchText = event.target.value;
    await loadSongs();
  });
  elements.songListSelect.addEventListener('change', async (event) => {
    state.selectedListId = event.target.value;
    await loadSongs();
    renderSongListOptions();
  });
  elements.randomButton.addEventListener('click', () => pickRandom('any'));
  elements.randomMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleRandomMenu();
  });
  elements.randomUnpopularButton.addEventListener('click', () => pickRandom('unpopular'));
  elements.randomPopularButton.addEventListener('click', () => pickRandom('popular'));
  document.addEventListener('click', closeRandomMenu);
  elements.gotoToggle?.addEventListener('click', toggleGotoNavigation);
  window.addEventListener('resize', updateGotoDefaultState);
  elements.newListButton.addEventListener('click', beginNewList);
  elements.editListButton.addEventListener('click', beginEditList);
  elements.deleteListButton.addEventListener('click', deleteSongList);
  elements.saveListButton.addEventListener('click', saveSongList);
  elements.cancelListButton.addEventListener('click', cancelSongList);
  elements.tableHeaders.forEach((header) => {
    header.addEventListener('click', async () => {
      const sortKey = header.dataset.sort;
      if (state.sortBy === sortKey) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = sortKey;
        state.sortOrder = 'asc';
      }
      updateSortHeaders();
      await loadSongs();
    });
  });
}

function renderSortButtons() {
  if (!elements.sortButtons) return;
  elements.sortButtons.classList.remove('hidden');
  elements.sortButtons.innerHTML = '';
  for (const header of elements.tableHeaders) {
    const sortKey = header.dataset.sort;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-button';
    const label = header.textContent.replace(/\s*[▲▼]/g, '').trim();
    const arrow = state.sortBy === sortKey ? (state.sortOrder === 'asc' ? '▲' : '▼') : '';
    button.textContent = `${label} ${arrow}`.trim();
    button.dataset.sort = sortKey;
    if (state.sortBy === sortKey) {
      button.classList.add('active');
    }
    button.addEventListener('click', async () => {
      if (state.sortBy === sortKey) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = sortKey;
        state.sortOrder = 'asc';
      }
      renderSortButtons();
      updateSortHeaders();
      await loadSongs();
    });
    elements.sortButtons.append(button);
  }
}

async function init() {
  attachEvents();
  updateGotoDefaultState();
  renderSortButtons();
  updateSortHeaders();
  renderQrImage();
  await loadSettings();
  await loadSongLists();
  setPage('songs');
}

init().catch((error) => setStatus(`Initialization failed: ${error.message}`, true));
