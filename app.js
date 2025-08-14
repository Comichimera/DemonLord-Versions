// app.js — build-first sorting + robust fallbacks
const state = { data: [], filtered: [], sort: 'build-desc' };

const el = {
  tbody: document.querySelector('#versionsTable tbody'),
  status: document.getElementById('status'),
  sortBy: document.getElementById('sortBy'),
  filter: document.getElementById('filter')
};

// Helpers
const toDate = d => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : -Infinity;
};
const toBuild = b => {
  const n = Number(b);
  return Number.isFinite(n) ? n : -Infinity;
};
const looksLikeSemver = v =>
  /^[vV]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(v || ''));

// Semver compare
function cmpSemver(a, b){
  const parse = v => {
    const [core, pre=''] = String(v || '').replace(/^v/i,'').split('-');
    const nums = core.split('.').map(n => parseInt(n,10) || 0);
    return { n: [nums[0]||0, nums[1]||0, nums[2]||0], pre };
  };
  const A = parse(a), B = parse(b);
  for(let i=0;i<3;i++){
    if(A.n[i] !== B.n[i]) return A.n[i] - B.n[i];
  }
  if(A.pre && !B.pre) return -1;
  if(!A.pre && B.pre) return 1;
  return A.pre < B.pre ? -1 : (A.pre > B.pre ? 1 : 0);
}

// Sorters (with sensible tie-breakers)
const sorters = {
  'build-desc': (a,b) =>
    (toBuild(b.build) - toBuild(a.build)) ||
    (toDate(b.date) - toDate(a.date)) ||
    (cmpSemver(b.version, a.version)),

  'build-asc': (a,b) =>
    (toBuild(a.build) - toBuild(b.build)) ||
    (toDate(a.date) - toDate(b.date)) ||
    (cmpSemver(a.version, b.version)),

  'semver-desc': (a,b) => (cmpSemver(a.version, b.version) * -1) ||
    (toDate(b.date) - toDate(a.date)),

  'semver-asc': (a,b) => cmpSemver(a.version, b.version) ||
    (toDate(a.date) - toDate(b.date)),

  'date-desc': (a,b) => (toDate(b.date) - toDate(a.date)) ||
    (toBuild(b.build) - toBuild(a.build)),

  'date-asc': (a,b) => (toDate(a.date) - toDate(b.date)) ||
    (toBuild(a.build) - toBuild(b.build))
};

// Choose a smart default sort for the dataset
function pickDefaultSort(arr){
  const hasNumericBuild = arr.some(r => Number.isFinite(Number(r.build)));
  if (hasNumericBuild) return 'build-desc';
  const allLookSemver = arr.every(r => looksLikeSemver(r.version));
  return allLookSemver ? 'semver-desc' : 'date-desc';
}

// Render
function render(){
  const rows = state.filtered.map(item => {
    const changes = (item.changes||[])
      .map(c => `<li>${escapeHtml(c)}</li>`).join('');
    const links = (item.links||[])
      .map(({label,url}) => `<a href="${encodeURI(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`)
      .join(' · ');
    const labels = [
      item.channel ? `<span class="tag" title="Release channel">${escapeHtml(item.channel)}</span>` : '',
      (item.build !== undefined && item.build !== null) ? `<span class="badge" title="Build number">Build ${escapeHtml(String(item.build))}</span>` : ''
    ].join(' ');
    return `<tr>
      <td><strong>${escapeHtml(item.version)}</strong> ${labels}</td>
      <td>${escapeHtml(item.date || '')}</td>
      <td>${changes ? `<ul class="changes">${changes}</ul>` : ''}</td>
      <td>${links}</td>
    </tr>`;
  }).join('');
  el.tbody.innerHTML = rows || `<tr><td colspan="4">No matching releases.</td></tr>`;
  el.status.textContent = `${state.filtered.length} release${state.filtered.length===1?'':'s'}`;
}

function applyFilter(){
  const q = el.filter.value.toLowerCase().trim();
  state.filtered = state.data
    .filter(it => {
      if(!q) return true;
      const hay = [
        it.version, it.date, it.channel, it.build,
        ...(it.changes||[]), ...(it.tags||[])
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort(sorters[state.sort]);
  render();
}

function setSort(value){
  state.sort = value in sorters ? value : state.sort;
  state.filtered = [...state.filtered].sort(sorters[state.sort]);
  // reflect in the dropdown
  if (el.sortBy && el.sortBy.value !== state.sort) el.sortBy.value = state.sort;
  render();
}

// Escape user-provided text
function escapeHtml(str){
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  return String(str).replace(/[&<>"']/g, s => map[s]);
}

// Init
async function load(){
  try{
    el.status.textContent = 'Loading…';
    const res = await fetch('versions.json', {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const arr = Array.isArray(json) ? json : (Array.isArray(json.releases) ? json.releases : []);
    state.data = arr;

    // Pick default sort (or honor ?sort=… if provided)
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('sort');
    state.sort = (fromUrl && sorters[fromUrl]) ? fromUrl : 'build-asc'; 

    // reflect in dropdown
    if (el.sortBy) el.sortBy.value = state.sort;

    state.filtered = [...state.data].sort(sorters[state.sort]);
    render();
    el.status.textContent = `${state.filtered.length} releases loaded`;
  }catch(err){
    console.error(err);
    el.status.textContent = 'Failed to load releases. Ensure versions.json is present and valid JSON.';
    el.tbody.innerHTML = `<tr><td colspan="4">Couldn’t load data.</td></tr>`;
  }
}

el.sortBy.addEventListener('change', e => setSort(e.target.value));
el.filter.addEventListener('input', applyFilter);

// Optional: keep sticky table header aligned to actual page header height
const header = document.querySelector('.site-header');
if (header) {
  document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
}

load();
