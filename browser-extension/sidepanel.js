function statusClass(record) {
  if (record.error) return 'err';
  if (typeof record.status === 'number' && record.status >= 400) return 'warn';
  return 'ok';
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function render(records) {
  const filterValue = document.getElementById('filter').value.trim().toLowerCase();
  const filtered = filterValue ? records.filter((r) => r.url.toLowerCase().includes(filterValue)) : records;

  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  list.innerHTML = '';

  if (filtered.length === 0) {
    empty.style.display = 'block';
    empty.textContent = records.length === 0 ? 'Chưa có request nào được ghi nhận.' : 'Không có request khớp bộ lọc.';
    return;
  }
  empty.style.display = 'none';

  for (const r of filtered) {
    const div = document.createElement('div');
    div.className = `row ${statusClass(r)}`;
    const statusText = r.error ? r.error : r.status !== null ? `HTTP ${r.status}` : '—';
    const time = new Date(r.finishedAt).toLocaleTimeString();
    div.innerHTML = `
      <div class="top">
        <span class="domain">${r.domain}</span>
        <span class="duration">${r.durationMs} ms</span>
      </div>
      <div class="meta">${r.method} ${pathOf(r.url)}</div>
      <div class="meta small">${statusText} · ${time}</div>
    `;
    list.appendChild(div);
  }
}

let latestRecords = [];

function refresh() {
  chrome.storage.session.get({ records: [] }, ({ records }) => {
    latestRecords = records;
    render(latestRecords);
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session' && changes.records) {
    latestRecords = changes.records.newValue || [];
    render(latestRecords);
  }
});

document.getElementById('filter').addEventListener('input', () => render(latestRecords));
document.getElementById('clear').addEventListener('click', () => {
  chrome.storage.session.set({ records: [] });
});

refresh();
