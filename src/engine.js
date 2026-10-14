/** Mightora Power BI Report Diff — privacy-first, dependency-free parsing and comparison. */
export const LIMITS = Object.freeze({ archiveBytes: 65 * 1024 * 1024, singleEntryBytes: 6 * 1024 * 1024, totalUnpackedBytes: 130 * 1024 * 1024, entries: 4000 });
const decoder = new TextDecoder('utf-8');
const TYPES = ['pages', 'visuals', 'measures', 'relationships', 'filters', 'bookmarks', 'formatting', 'settings'];
const LABELS = { pages: 'Pages & layout', visuals: 'Visuals', measures: 'DAX measures', relationships: 'Relationships', filters: 'Filters', bookmarks: 'Bookmarks', formatting: 'Formatting', settings: 'Report settings' };
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k => k !== '$schema' && k !== 'lineageTag' && k !== 'modifiedTime').sort().map(k => [k, canonical(value[k])]));
  return value;
};
export const stableString = value => JSON.stringify(canonical(value ?? null), null, 2);
const cleanName = name => String(name || '').replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
const parseJson = (text, file) => { try { return JSON.parse(text); } catch (err) { throw new Error(`Invalid JSON in ${file}: ${err.message}`); } };
const first = (...values) => values.find(v => v !== undefined && v !== null);
const object = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const maxPath = path => path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');

/** ZIP archive central-directory reader; data is decompressed only after its size is validated. */
export async function readZip(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length > LIMITS.archiveBytes) throw new Error('Archive exceeds the 65 MB safety limit. Export a smaller project.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50) { end = p; break; }
  }
  if (end === -1) throw new Error('Invalid ZIP archive: central directory not found.');
  const entryCount = view.getUint16(end + 10, true);
  if (entryCount > LIMITS.entries || view.getUint16(end + 8, true) !== entryCount) throw new Error('Unsupported ZIP: too many entries or multi-disk archive.');
  const offset = view.getUint32(end + 16, true);
  if (offset === 0xffffffff || view.getUint32(end + 12, true) === 0xffffffff) throw new Error('ZIP64 is not currently supported.');
  let cursor = offset; let total = 0;
  const files = {};
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = view.getUint16(cursor + 10, true);
    const flags = view.getUint16(cursor + 8, true);
    const compressed = view.getUint32(cursor + 20, true);
    const original = view.getUint32(cursor + 24, true);
    const len = view.getUint16(cursor + 28, true);
    const extra = view.getUint16(cursor + 30, true);
    const comment = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (cursor + 46 + len + extra + comment > data.length) throw new Error('Corrupt ZIP entry name.');
    const name = maxPath(decoder.decode(data.subarray(cursor + 46, cursor + 46 + len)));
    cursor += 46 + len + extra + comment;
    if (name.endsWith('/') || /(^|\/)(\.git|node_modules|\.pbi)(\/|$)/i.test(name)) continue;
    if (name.split('/').some(seg => seg === '..') || name.startsWith('/')) throw new Error('Unsafe archive path detected.');
    // Skip binary assets: no need to decompress images, datasets, backups, or custom visuals.
    if (!/(^|\/)(Layout|.*\.(json|tmdl|bim|pbir|pbism))$/i.test(name)) continue;
    if ((flags & 1) || (method !== 8 && method !== 0)) continue;
    if (original > LIMITS.singleEntryBytes || (total += original) > LIMITS.totalUnpackedBytes) throw new Error('Archive contains files exceeding the safe extraction limits.');
    if (localOffset + 30 > data.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt ZIP local entry header.');
    const payloadStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (payloadStart + compressed > data.length) throw new Error('Corrupt ZIP payload.');
    const payload = data.subarray(payloadStart, payloadStart + compressed);
    let unpacked;
    if (method === 0) unpacked = payload;
    else {
      if (!globalThis.DecompressionStream) throw new Error('ZIP decompression requires a modern browser with DecompressionStream support.');
      const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      // Enforce the advertised uncompressed limit *while streaming*, not after
      // allocating a potentially malicious decompression bomb.
      const reader = stream.getReader(); const chunks = []; let bytesRead = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          if (bytesRead > original || bytesRead > LIMITS.singleEntryBytes) { await reader.cancel(); throw new Error(`Archive entry exceeded declared extraction size: ${name}`); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      unpacked = new Uint8Array(bytesRead);
      let position = 0;
      for (const chunk of chunks) { unpacked.set(chunk, position); position += chunk.length; }
    }
    if (unpacked.length !== original) throw new Error(`Invalid extracted size for ${name}.`);
    files[name] = unpacked;
  }
  return files;
}
export function decodeText(bytes) {
  if (typeof bytes === 'string') return bytes;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  // Some PBIX Report/Layout entries are UTF-16LE without a BOM.
  if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder('utf-16le').decode(bytes);
  return decoder.decode(bytes).replace(/^\uFEFF/, '');
}
function snapshot(name) {
  return { name, source: 'unknown', supported: Object.fromEntries(TYPES.map(t => [t, false])), entities: Object.fromEntries(TYPES.map(t => [t, {}])), warnings: [], inspectedFiles: 0 };
}
const store = (s, type, id, label, value, extra = {}) => { s.entities[type][String(id)] = { id: String(id), label: String(label), value: canonical(value), ...extra }; };
function pagePosition(source) { return { x: first(source.x, 0), y: first(source.y, 0), width: first(source.width, 0), height: first(source.height, 0), z: first(source.z, 0), tabOrder: first(source.tabOrder, 0) }; }
function parsePBIR(s, files) {
  const entries = Object.entries(files).filter(([path]) => /\/definition\/(report\.json|pages\/|bookmarks\/|reportExtensions\.json)/i.test('/' + path) || /^definition\/(report\.json|pages\/|bookmarks\/|reportExtensions\.json)/i.test(path));
  const reportRoots = new Map();
  for (const [path] of entries) {
    const match = path.match(/^(.*?)(?:\/)?definition\/report\.json$/i);
    if (match) reportRoots.set(match[1], path);
  }
  if (!reportRoots.size) return false;
  // Only one report per upload to avoid silently combining unrelated projects.
  const root = [...reportRoots.keys()].sort((a,b) => a.length - b.length)[0];
  if (reportRoots.size > 1) s.warnings.push('Multiple report definitions found; analysed the first report only.');
  const prefix = root ? root + '/definition/' : 'definition/';
  const grab = (suffix) => files[prefix + suffix];
  const report = parseJson(decodeText(grab('report.json')), prefix + 'report.json');
  s.source = 'PBIR';
  for (const t of ['pages','visuals','filters','bookmarks','formatting','settings']) s.supported[t] = true;
  store(s, 'settings', 'report', 'Report configuration', { ...report, filterConfig: undefined, objects: undefined, themeCollection: undefined });
  if (report.filterConfig !== undefined) store(s, 'filters', 'report', 'Report filters', report.filterConfig);
  if (report.objects !== undefined || report.themeCollection !== undefined) store(s, 'formatting', 'report', 'Report appearance', { objects: report.objects, themeCollection: report.themeCollection });
  const pageOrder = grab('pages/pages.json') ? parseJson(decodeText(grab('pages/pages.json')), 'pages.json') : {};
  store(s, 'settings', 'page-order', 'Page order & active page', { pageOrder: pageOrder.pageOrder, activePageName: pageOrder.activePageName });
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    let match = rel.match(/^pages\/([^/]+)\/page\.json$/i);
    if (match) {
      const page = parseJson(decodeText(bytes), path); const id = String(page.name || match[1]); const display = page.displayName || id;
      store(s, 'pages', id, display, { displayName: display, width: page.width, height: page.height, displayOption: page.displayOption, visibility: page.visibility, pageBinding: page.pageBinding, type: page.type, pageOrder: pageOrder.pageOrder?.indexOf(id) ?? -1, objects: page.objects });
      if (page.filterConfig !== undefined) store(s, 'filters', `page:${id}`, `Page · ${display}`, page.filterConfig);
      if (page.objects !== undefined || page.background !== undefined || page.wallpaper !== undefined) store(s, 'formatting', `page:${id}`, `Page · ${display}`, { objects: page.objects, background: page.background, wallpaper: page.wallpaper });
      continue;
    }
    match = rel.match(/^pages\/([^/]+)\/visuals\/([^/]+)\/(visual|mobile)\.json$/i);
    if (match) {
      const [, pageId, visualId, variant] = match;
      const v = parseJson(decodeText(bytes), path); const id = v.name || visualId;
      const key = `${pageId}/${id}`;
      const visual = object(v.visual); const label = `${pageId} · ${visual.visualType || id}`;
      if (variant.toLowerCase() === 'mobile') {
        store(s, 'pages', `mobile:${key}`, `Mobile position · ${label}`, { mobile: v.position || v });
        continue;
      }
      store(s, 'visuals', key, label, { type: visual.visualType || v.type, position: pagePosition(v.position || {}), query: visual.query, visualContainer: v.parentGroupName, isHidden: v.isHidden, drillFilterOtherVisuals: visual.drillFilterOtherVisuals, visualTypeInfo: v.visualTypeInfo });
      if (v.filterConfig !== undefined || visual.filterConfig !== undefined) store(s, 'filters', `visual:${key}`, `Visual · ${label}`, first(v.filterConfig, visual.filterConfig));
      if (visual.objects !== undefined || visual.visualContainerObjects !== undefined || v.objects !== undefined) store(s, 'formatting', `visual:${key}`, `Visual · ${label}`, { objects: visual.objects, visualContainerObjects: visual.visualContainerObjects, container: v.objects });
      continue;
    }
    match = rel.match(/^bookmarks\/([^/]+)\.bookmark\.json$/i);
    if (match) { const b = parseJson(decodeText(bytes), path); store(s, 'bookmarks', b.name || match[1], b.displayName || b.name || match[1], b); }
    if (rel === 'bookmarks/bookmarks.json') store(s, 'settings', 'bookmark-order', 'Bookmark order & groups', parseJson(decodeText(bytes), path));
    if (rel === 'reportExtensions.json') {
      const ext = parseJson(decodeText(bytes), path);
      store(s, 'settings', 'report-extensions', 'Report extensions', ext);
    }
  }
  return true;
}
function parseLegacy(s, files) {
  const key = Object.keys(files).find(k => /(^|\/)Report\/Layout$/i.test(k)) || Object.keys(files).find(k => /(^|\/)report\.json$/i.test(k) && !k.includes('/definition/'));
  if (!key) return false;
  const report = parseJson(decodeText(files[key]), key);
  if (!Array.isArray(report.sections)) return false;
  s.source = 'PBIX/PBIT legacy layout';
  for (const t of ['pages', 'visuals', 'filters', 'formatting', 'settings']) s.supported[t] = true;
  // Legacy bookmark metadata is not universally present. Do not claim coverage
  // unless there is positive evidence of a bookmark list in the layout config.
  s.supported.bookmarks = Array.isArray(parseMaybeJson(report.config)?.bookmarks);
  s.warnings.push('Legacy layout parsing is best-effort. Embedded binary DataModel is not decoded; DAX measures and relationships may be unavailable.');
  store(s, 'settings', 'report', 'Report settings', { theme: report.theme, config: report.config, layoutOptimization: report.layoutOptimization });
  if (report.filters) store(s, 'filters', 'report', 'Report filters', parseMaybeJson(report.filters));
  for (const [ix, page] of report.sections.entries()) {
    const id = page.name || `page-${ix}`; const label = page.displayName || id;
    store(s, 'pages', id, label, { displayName: label, width: page.width, height: page.height, ordinal: page.ordinal, visibility: page.visibility, background: page.background });
    if (page.filters) store(s, 'filters', `page:${id}`, `Page · ${label}`, parseMaybeJson(page.filters));
    for (const [j, item] of (page.visualContainers || []).entries()) {
      const config = parseMaybeJson(item.config) || {}; const query = parseMaybeJson(item.query);
      const id2 = config.name || `visual-${j}`;
      const key2 = `${id}/${id2}`; const title = `${label} · ${config.singleVisual?.visualType || id2}`;
      store(s, 'visuals', key2, title, { type: config.singleVisual?.visualType, position: pagePosition(config.layouts?.[0]?.position || item), query });
      if (item.filters) store(s, 'filters', `visual:${key2}`, `Visual · ${title}`, parseMaybeJson(item.filters));
      if (config.singleVisual?.objects || config.objects) store(s, 'formatting', `visual:${key2}`, `Visual · ${title}`, { objects: config.singleVisual?.objects, container: config.objects });
    }
  }
  for (const [index, b] of (parseMaybeJson(report.config)?.bookmarks || []).entries()) store(s, 'bookmarks', b.name || `bookmark-${index}`, b.displayName || b.name || `Bookmark ${index+1}`, b);
  return true;
}
function parseMaybeJson(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } } return v; }
function readBim(s, files) {
  const paths = Object.keys(files).filter(path => /(^|\/)model\.bim$/i.test(path));
  if (!paths.length) return false;
  const model = parseJson(decodeText(files[paths[0]]), paths[0]);
  const m = model.model || model;
  s.supported.measures = true; s.supported.relationships = true;
  for (const t of m.tables || []) for (const measure of t.measures || []) store(s, 'measures', `${t.name}.[${measure.name}]`, `${t.name} · ${measure.name}`, { expression: measure.expression, formatString: measure.formatString, isHidden: measure.isHidden, description: measure.description });
  for (const [i, r] of (m.relationships || []).entries()) {
    const key = r.name || `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}`;
    store(s, 'relationships', key, `${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`, r);
  }
  return true;
}
const declaration = /^([\t ]*)(measure|relationship)\s+('(?:[^']|'')+'|[^=\s]+(?:\s+[^=\s]+)*?)(?:\s*=\s*(.*))?$/i;
function tmdlBlocks(input) {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declaration);
    if (!m) continue;
    const indent = m[1].replaceAll('\t', '    ').length;
    const body = []; let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) { body.push(line); continue; }
      const lead = (line.match(/^[ \t]*/) || [''])[0].replaceAll('\t', '    ').length;
      if (lead <= indent) break;
      body.push(line);
    }
    blocks.push({ type: m[2].toLowerCase(), name: cleanName(m[3].trim()), expression: m[4]?.trim() || '', body: body.join('\n').trimEnd() });
    i = j - 1;
  }
  return blocks;
}
function parseTmdl(s, files) {
  const paths = Object.keys(files).filter(k => k.toLowerCase().endsWith('.tmdl') && (/\/tables\//i.test('/'+k) || /relationships\.tmdl$/i.test(k) || Object.keys(files).length === 1));
  if (!paths.length) return false;
  const hasTables = paths.some(k => /\/tables\//i.test('/'+k)) || (paths.length === 1 && !/relationship/i.test(paths[0]));
  const hasRels = paths.some(k => /relationships\.tmdl$/i.test(k)) || paths.some(k => /\brelationship\s/i.test(decodeText(files[k])));
  if (hasTables) s.supported.measures = true;
  if (hasRels) s.supported.relationships = true;
  for (const path of paths) {
    const text = decodeText(files[path]); const table = (path.split('/').at(-1) || '').replace(/\.tmdl$/i, '');
    for (const block of tmdlBlocks(text)) {
      if (block.type === 'measure') {
        const body = block.body.split('\n');
        const meta = body.filter(l => /^\s*(?:formatString|isHidden|description|displayFolder)\s*:/i.test(l)).map(l => l.trim());
        // Keep the source expression and measure properties for meaningful diffs, but exclude lineage IDs.
        const daxBody = body.filter(l => !/^\s*(?:lineageTag|formatString|isHidden|description|displayFolder|annotation)\s*:/i.test(l)).join('\n').trim();
        store(s, 'measures', `${table}.[${block.name}]`, `${table} · ${block.name}`, { dax: [block.expression, daxBody].filter(Boolean).join('\n').trim(), properties: meta });
      } else if (block.type === 'relationship') {
        const props = Object.fromEntries(block.body.split('\n').map(l => l.trim().match(/^([\w]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));
        store(s, 'relationships', block.name, `${props.fromColumn || block.name} → ${props.toColumn || ''}`, props);
      }
    }
  }
  return true;
}
export function parseFiles(name, rawFiles) {
  const s = snapshot(name);
  const files = Object.fromEntries(Object.entries(rawFiles).map(([k,v]) => [maxPath(k), v]));
  s.inspectedFiles = Object.keys(files).length;
  if (!s.inspectedFiles) throw new Error('No readable report files found.');
  const simple = Object.entries(files).filter(([k]) => /\.json$/i.test(k));
  if (simple.length === 1) {
    try { const snap = JSON.parse(decodeText(simple[0][1])); if (snap.format === 'mightora-report-snapshot-v1' && snap.entities) return { ...s, ...snap, name }; } catch { /* not a snapshot */ }
  }
  if (!parsePBIR(s, files)) parseLegacy(s, files);
  if (!readBim(s, files)) parseTmdl(s, files);
  if (!Object.values(s.supported).some(Boolean)) throw new Error('No supported Power BI metadata found. Use a ZIP of the PBIP project (Report + SemanticModel), a PBIR export, or a legacy PBIX with a readable Report/Layout.');
  if (!s.supported.measures) s.warnings.push('DAX comparison unavailable: no TMDL table files or model.bim found.');
  if (!s.supported.relationships) s.warnings.push('Relationship comparison unavailable: no TMDL relationships or model.bim found.');
  return s;
}
export async function parseUpload(name, files) {
  const collected = {};
  for (const file of files) {
    if (file.size > LIMITS.archiveBytes) throw new Error(`${file.name} exceeds the 65 MB size limit.`);
    const path = file.webkitRelativePath || file.name;
    if (/\.(zip|pbix|pbit)$/i.test(file.name)) Object.assign(collected, await readZip(await file.arrayBuffer()));
    else if (/\.(json|tmdl|bim|pbir|pbism)$/i.test(file.name) || /\/Layout$/i.test(path)) collected[path] = new Uint8Array(await file.arrayBuffer());
  }
  return parseFiles(name, collected);
}
export function compare(before, after) {
  if (!before || !after) throw new Error('Two versions are required.');
  const items = []; const coverage = [];
  for (const type of TYPES) {
    const supported = before.supported[type] && after.supported[type];
    if (!supported) { coverage.push({ type, label: LABELS[type], status: 'unavailable', message: `${!before.supported[type] ? 'Baseline' : ''}${!before.supported[type] && !after.supported[type] ? ' and ' : ''}${!after.supported[type] ? 'updated version' : ''} lacks comparable metadata.` }); continue; }
    coverage.push({ type, label: LABELS[type], status: 'compared' });
    const keys = new Set([...Object.keys(before.entities[type] || {}), ...Object.keys(after.entities[type] || {})]);
    for (const id of [...keys].sort()) {
      const oldItem = before.entities[type]?.[id], newItem = after.entities[type]?.[id];
      const oldData = oldItem?.value, newData = newItem?.value;
      const status = !oldItem ? 'added' : !newItem ? 'removed' : stableString(oldData) !== stableString(newData) ? 'modified' : 'unchanged';
      items.push({ type, category: LABELS[type], id, label: newItem?.label || oldItem?.label || id, status, before: oldData, after: newData });
    }
  }
  const changed = items.filter(i => i.status !== 'unchanged');
  return { before: before.name, after: after.name, beforeFormat: before.source, afterFormat: after.source, warnings: [...before.warnings.map(w => `Baseline: ${w}`), ...after.warnings.map(w => `Updated: ${w}`)], coverage, items, changed, totals: { added: changed.filter(x => x.status === 'added').length, removed: changed.filter(x => x.status === 'removed').length, modified: changed.filter(x => x.status === 'modified').length, unchanged: items.length - changed.length, unverified: coverage.filter(c => c.status !== 'compared').length } };
}
const markdownEscape = str => String(str).replace(/([\\`*_{}\[\]<>|])/g, '\\$1').replace(/[\r\n]+/g, ' ');
export function releaseNotes(result) {
  const date = new Date().toISOString().slice(0,10);
  const notes = [`# Power BI report release notes`, '', `**Date:** ${date}`, `**Baseline:** ${markdownEscape(result.before)}`, `**Updated:** ${markdownEscape(result.after)}`, '', '## Change summary', '', `- Added: **${result.totals.added}**`, `- Modified: **${result.totals.modified}**`, `- Removed: **${result.totals.removed}**`, `- Unverified categories: **${result.totals.unverified}**`, ''];
  for (const type of TYPES) {
    const changes = result.changed.filter(i => i.type === type);
    if (!changes.length) continue;
    notes.push(`## ${LABELS[type]}`, '');
    for (const item of changes) notes.push(`- **${item.status[0].toUpperCase()+item.status.slice(1)}:** ${markdownEscape(item.label)}`);
    notes.push('');
  }
  notes.push('## Comparison coverage', '');
  for (const c of result.coverage) notes.push(`- ${c.label}: ${c.status === 'compared' ? 'Compared' : 'Not verified — ' + c.message}`);
  if (result.warnings.length) notes.push('', '## Limitations & warnings', '', ...result.warnings.map(w => `- ${markdownEscape(w)}`));
  notes.push('', '> Generated locally by Mightora Power BI Report Diff. A metadata comparison is not a substitute for functional, data or performance testing.', '');
  return notes.join('\n');
}
export { TYPES, LABELS };
