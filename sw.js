/* NMDR Portal service worker
   Offline first. Pages are served from cache so the portal opens with no
   network. New versions arrive only when the user presses Update.

   Edit PRECACHE below to match the files sitting beside index.html.
*/

const APP_VERSION   = 'nmdr-2026-09-11d';
const SHELL_CACHE   = 'nmdr-shell-' + APP_VERSION;
const RUNTIME_CACHE = 'nmdr-runtime';
/* Holds the last answer from each script or data service, for example a TPR
   run. Survives new versions and is only overwritten by a fresh run. */
const RESULT_CACHE  = 'nmdr-results';

/* Files fetched and stored the moment the portal is first opened. */
const PRECACHE = [
  /* portal shell */
  './',
  './index.html',
  './offline.html',
  './nmdr-offline.js',
  './manifest.json',
  /* images and icons */
  './mohlogo.png',
  './ICF-SL.jpg',
  './nmdr_architecture.jpg',
  './nmdr_info.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  /* every tool page the portal opens (a file that is not in the repo is skipped) */
  './all.html',
  './analytic_training.html',
  './automation.html',
  './bulletins.html',
  './confirmed.html',
  './confirmed_and_treated.html',
  './confirmed_not_treated.html',
  './data_extraction.html',
  './dmat_allages.html',
  './dmat_comparative.html',
  './dmat_confirmed.html',
  './dmat_confirmed_and_treated.html',
  './dmat_confirmed_not_treated.html',
  './dmat_eidsr.html',
  './dmat_presumptive.html',
  './dmat_reporting.html',
  './dmat_suspected.html',
  './dmat_tested.html',
  './dmat_total_treated.html',
  './dmat_u5.html',
  './dqa.html',
  './dqa_tool_v5_drive.html',
  './eidsr_extraction.html',
  './ento_dashboard.html',
  './ento_data.html',
  './ento_report.html',
  './finance_dashboard.html',
  './finance_data.html',
  './finance_report.html',
  './form_k.html',
  './gf_plan.html',
  './google_drive_files.html',
  './int_anc.html',
  './int_iptp.html',
  './int_irs.html',
  './int_malaria_vaccine.html',
  './int_mass_itn.html',
  './int_measles.html',
  './int_penta.html',
  './int_pmc.html',
  './int_sbd.html',
  './int_vitamin_a.html',
  './ir_dashboard.html',
  './ir_data.html',
  './ir_report.html',
  './me_reports.html',
  './mocm_hospital.html',
  './mocm_hospital_v2.html',
  './mocm_lab.html',
  './mocm_phu.html',
  './mpd.html',
  './mpr.html',
  './navigation.html',
  './opd.html',
  './other_trend_allages.html',
  './other_trend_u5.html',
  './partners.html',
  './presumptive.html',
  './quant_dashboard.html',
  './quant_data.html',
  './sbd.html',
  './snt.html',
  './supply_track_dashboard.html',
  './supply_track_data.html',
  './survey_data.html',
  './survey_report.html',
  './suspected.html',
  './tes_dashboard.html',
  './tes_data.html',
  './tes_report.html',
  './testing.html',
  './tpr.html',
  './treated.html',
  './user.html',
  './warehouse.html'
];

/* Parameters that only exist to defeat the browser cache. They are dropped when
   a result is filed, otherwise every run would be stored under a new name and
   nothing would ever be found again offline. */
const NOISE_PARAMS = ['t', '_', 'ts', 'r', 'rand', 'random', 'nocache', 'cachebust', 'cb', 'v'];

/* Cross origin hosts whose files are safe to keep for offline use.
   Everything else cross origin (DHIS2, Apps Script) always goes to the
   network and is never stored. */
const CACHEABLE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.plot.ly',
  'code.jquery.com',
  'd3js.org',
  'cdn.sheetjs.com',
  'cdn.datatables.net',
  'cdn.tailwindcss.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com'
];

/* Files a page pulls in: its stylesheets, scripts, images, CSVs and fonts.
   These are read straight out of the page text, so a tool page is fully usable
   offline before anyone has ever opened it. Only this site and the library
   hosts above are followed, so DHIS2 and Apps Script are never touched. */
const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|csv|tsv|json|geojson|topojson|txt|xlsx?|pdf|mp3|mp4|webm)$/i;

function followable(href, base) {
  let u;
  try { u = new URL(href, base || self.location); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;   // data:, blob:, mailto:
  if (u.origin === self.location.origin) return u.href;
  return CACHEABLE_HOSTS.includes(u.hostname) ? u.href : null;
}

/* Pull every referenced file out of one page or stylesheet. Paths are resolved
   against the file they were found in, not the site root, so a stylesheet in a
   subfolder still points at the right images. */
function assetsIn(text, isCss, base) {
  const found = new Set();
  const add = raw => {
    if (!raw) return;
    const href = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!href || href.startsWith('#')) return;
    const abs = followable(href, base);
    if (!abs) return;
    const path = abs.split('?')[0].split('#')[0];
    // Keep real files, plus font and stylesheet links that carry no extension
    if (ASSET_EXT.test(path) || /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(abs)) found.add(abs);
  };

  if (isCss) {
    let m;
    const url = /url\(\s*([^)]+?)\s*\)/gi;
    while ((m = url.exec(text))) add(m[1]);
    const imp = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gi;
    while ((m = imp.exec(text))) add(m[1]);
    return [...found];
  }

  let m;
  const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  while ((m = attr.exec(text))) add(m[1]);
  const style = /url\(\s*['"]?([^'")]+)/gi;
  while ((m = style.exec(text))) add(m[1]);
  // fetch('data/foo.csv') and similar inside page scripts
  const inJs = /["'`]([^"'`\s<>]+\.(?:csv|tsv|json|geojson|topojson|png|jpe?g|svg|webp|js|css|xlsx?))["'`]/gi;
  while ((m = inJs.exec(text))) add(m[1]);
  return [...found];
}

/* Save a file, then follow what it references. Depth 2 covers page -> stylesheet -> font. */
async function cacheWithAssets(url, cache, seen, depth) {
  if (seen.has(url)) return 0;
  seen.add(url);

  let res;
  try {
    res = await fetch(new Request(url, { cache: 'reload', mode: 'cors', credentials: 'omit' }));
  } catch (e) {
    try { res = await fetch(new Request(url, { cache: 'reload', mode: 'no-cors' })); }
    catch (e2) {
      /* The network itself failed. This is NOT the same as a file that is not
         in the repo, and the Update button must be able to tell the two apart,
         so it is thrown rather than counted as a skip. */
      throw new Error('netfail:' + url);
    }
  }
  /* A reply that is not ok means the file is simply not there, which is normal
     for the tool pages that have not been published yet. Skipped, not failed. */
  if (!res || (!res.ok && res.type !== 'opaque')) return 0;

  const type = res.headers.get('Content-Type') || '';
  const isHtml = /html/i.test(type) || /\.html?$/i.test(url.split('?')[0]);
  const isCss  = /css/i.test(type)  || /\.css$/i.test(url.split('?')[0]);

  let text = null;
  if (depth > 0 && (isHtml || isCss) && res.type !== 'opaque') {
    try { text = await res.clone().text(); } catch (e) { text = null; }
  }

  await cache.put(url, res);
  let saved = 1;

  if (text) {
    const links = assetsIn(text, isCss, url).filter(u => !seen.has(u));
    const counts = [];
    let netfail = null;
    await inBatches(links, async u => {
      try { counts.push(await cacheWithAssets(u, cache, seen, depth - 1)); }
      catch (e) {
        if (String(e && e.message).startsWith('netfail:')) netfail = netfail || e;
      }
    });
    saved += counts.reduce((a, b) => a + b, 0);
    if (netfail) throw netfail;
  }
  return saved;
}

/* ---------------------------------------------------------------- install */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const seen = new Set();
    // Each file on its own so a single missing file cannot fail the whole install.
    await inBatches(PRECACHE, async url => {
      try {
        await cacheWithAssets(new URL(url, self.location).href, cache, seen, 2);
      } catch (e) { /* file not present yet, runtime caching will pick it up */ }
    });
  })());
});

/* Run a task over a list a few at a time: fast on a good line, gentle on a weak one. */
async function inBatches(list, task, size = 6) {
  for (let i = 0; i < list.length; i += size) {
    await Promise.all(list.slice(i, i + size).map(task));
  }
}

/* --------------------------------------------------------------- activate */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n.startsWith('nmdr-shell-') && n !== SHELL_CACHE)
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* ------------------------------------------------------------------ fetch */

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Who may open what changes in the staff directory, so access.csv is always
     read from the network, with the last copy kept only as an offline
     fallback. Serving a stale copy from the shell would freeze people's tabs. */
  if (/access\.csv$/i.test(url.pathname)) {
    event.respondWith(networkFirstKeepLast(req));
    return;
  }

  // Apps Script, DHIS2 and any other data service: always ask the network
  // first, so a run is always live, but keep the answer. If the same run is
  // asked for later with no connection, the last answer is served instead of
  // an error. A new run simply replaces it.
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirstKeepLast(req));
    return;
  }

  event.respondWith(cacheFirst(req, sameOrigin));
});

async function cacheFirst(req, sameOrigin) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(req, { ignoreSearch: sameOrigin });
  if (hit) return hit;

  const runtime = await caches.open(RUNTIME_CACHE);
  const runtimeHit = await runtime.match(req);
  if (runtimeHit) return runtimeHit;

  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      runtime.put(req, res.clone());
    }
    return res;
  } catch (e) {
    if (req.mode === 'navigate') {
      // The portal itself falls back to index.html; a tool page that was never
      // saved shows offline.html instead of a second copy of the portal.
      const path = new URL(req.url).pathname;
      const isPortal = path.endsWith('/') || path.endsWith('/index.html');
      const fallback = (await shell.match(isPortal ? './index.html' : './offline.html')) ||
                       (await shell.match('./index.html'));
      if (fallback) return fallback;
    }
    return new Response(
      'Offline and this file has not been saved to the device yet.',
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}

/* ------------------------------------------------------- script results */

/* The name a result is filed under: the same request minus the noise. */
function resultKey(rawUrl) {
  const u = new URL(rawUrl);
  NOISE_PARAMS.forEach(p => u.searchParams.delete(p));
  u.hash = '';
  return u.href;
}

async function networkFirstKeepLast(req) {
  const cache = await caches.open(RESULT_CACHE);
  const key = resultKey(req.url);

  try {
    const res = await fetch(req);

    // Only a real answer replaces the stored one. An error page or a login
    // redirect must never overwrite a good result.
    if (res && res.ok && res.type !== 'opaque') {
      const size = parseInt(res.headers.get('Content-Length') || '0', 10);
      if (size <= 20971520) {           // skip anything over 20 MB
        try { await cache.put(key, res.clone()); } catch (e) { /* quota */ }
      }
    }
    return res;
  } catch (e) {
    const last = await cache.match(key);
    if (last) {
      // Marked so a page can tell the difference if it wants to.
      const headers = new Headers(last.headers);
      headers.set('X-NMDR-From-Cache', '1');
      return new Response(await last.blob(), { status: last.status, statusText: last.statusText, headers });
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'No connection and this has not been run on this device yet.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* --------------------------------------------------------------- messages */

self.addEventListener('message', event => {
  const data = event.data || {};
  const reply = msg => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
  };

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_VERSION') {
    reply({ type: 'VERSION', version: APP_VERSION });
    return;
  }


  if (data.type === 'REFRESH_CONTENT') {
    // Always reply, including on failure, or the page waits for the timeout.
    event.waitUntil(
      refreshContent().then(reply, function (err) {
        reply({ type: 'REFRESH_DONE', updated: 0, failed: [], error: String(err && err.message || err) });
      })
    );
  }
});

/* Re-download every same origin file already held, plus the precache list,
   bypassing the browser HTTP cache. This is what the Update button runs.

   ALL OR NOTHING. Everything is downloaded into a pair of staging caches
   first. The files people are using are not touched until every download has
   succeeded. If the connection drops halfway, the staging caches are thrown
   away and the portal carries on with exactly the files it had, so a failed
   update can never leave a half replaced, broken set on the device.

   A file that answers 404 is not a failure: the precache list names tool pages
   that are not all published. Only a network failure counts. */

const STAGE_SHELL   = 'nmdr-stage-shell';
const STAGE_RUNTIME = 'nmdr-stage-runtime';

async function dropStaging() {
  await caches.delete(STAGE_SHELL);
  await caches.delete(STAGE_RUNTIME);
}

/* moves everything downloaded into the caches the portal actually reads */
async function commitStaging() {
  let moved = 0;
  for (const [stageName, liveName] of [[STAGE_SHELL, SHELL_CACHE], [STAGE_RUNTIME, RUNTIME_CACHE]]) {
    const stage = await caches.open(stageName);
    const live  = await caches.open(liveName);
    const keys  = await stage.keys();
    for (const req of keys) {
      const res = await stage.match(req);
      if (res) { await live.put(req, res); moved++; }
    }
  }
  await dropStaging();
  return moved;
}

async function refreshContent() {
  const shell   = await caches.open(SHELL_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);

  /* start from clean staging, in case a previous attempt was cut off */
  await dropStaging();
  const stageShell   = await caches.open(STAGE_SHELL);
  const stageRuntime = await caches.open(STAGE_RUNTIME);

  const targets = new Map();   // url -> the staging cache it belongs in

  for (const url of PRECACHE) {
    targets.set(new URL(url, self.location).href, stageShell);
  }
  for (const [cache, stage] of [[shell, stageShell], [runtime, stageRuntime]]) {
    for (const req of await cache.keys()) {
      if (new URL(req.url).origin === self.location.origin) {
        if (!targets.has(req.url)) targets.set(req.url, stage);
      }
    }
  }

  let updated = 0;
  const missing = [];      // not in the repo, fine
  const netfail = [];      // the connection let go, not fine
  const seen = new Set();

  await inBatches([...targets], async ([url, stage]) => {
    if (seen.has(url)) return;
    try {
      const n = await cacheWithAssets(url, stage, seen, 2);
      if (n) updated += n; else missing.push(url);
    } catch (e) {
      if (String(e && e.message).startsWith('netfail:')) netfail.push(url);
      else missing.push(url);
    }
  });

  /* anything at all went wrong on the wire: keep what the device already has */
  if (netfail.length || updated === 0) {
    await dropStaging();
    return {
      type: 'REFRESH_DONE',
      complete: false,
      updated: 0,
      netfail: netfail.slice(0, 12),
      failed: netfail.slice(0, 12),
      missing: missing.length,
      version: APP_VERSION,
      kept: true
    };
  }

  const moved = await commitStaging();
  return {
    type: 'REFRESH_DONE',
    complete: true,
    updated: moved || updated,
    failed: [],
    missing: missing.length,
    version: APP_VERSION
  };
}
