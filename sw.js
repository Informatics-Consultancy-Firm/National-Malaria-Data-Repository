/* NMDR Portal service worker
   Offline first. Pages are served from cache so the portal opens with no
   network. New versions arrive only when the user presses Update.

   Edit PRECACHE below to match the files sitting beside index.html.
*/

const APP_VERSION   = 'nmdr-2026-09-11b';
const SHELL_CACHE   = 'nmdr-shell-' + APP_VERSION;
const RUNTIME_CACHE = 'nmdr-runtime';

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

/* ---------------------------------------------------------------- install */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Each file on its own so a single missing file cannot fail the whole install.
    await inBatches(PRECACHE, async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
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

  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) {
    return; // DHIS2, Apps Script and any other API: straight to the network
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
   bypassing the browser HTTP cache. This is what the Update button runs. */
async function refreshContent() {
  const shell   = await caches.open(SHELL_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);

  const targets = new Map(); // url -> cache holding it

  for (const url of PRECACHE) {
    targets.set(new URL(url, self.location).href, shell);
  }
  for (const cache of [shell, runtime]) {
    for (const req of await cache.keys()) {
      if (new URL(req.url).origin === self.location.origin) {
        targets.set(req.url, cache);
      }
    }
  }

  let updated = 0;
  const failed = [];

  await inBatches([...targets], async ([url, cache]) => {
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (res.ok) {
        await cache.put(url, res);
        updated++;
      } else {
        failed.push(url + ' (' + res.status + ')');
      }
    } catch (e) {
      failed.push(url);
    }
  });

  return { type: 'REFRESH_DONE', updated, failed, version: APP_VERSION };
}
