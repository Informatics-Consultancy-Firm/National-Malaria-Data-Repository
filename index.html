/* ══════════════════════════════════════════════════════════════════════════
   AUTOMATIC MAIN MENU BUTTON

   Every tool opens in the whole browser window rather than in an iframe, so each one
   needs a way back to the portal. Rather than pasting a snippet into dozens of files,
   this service worker adds it for them: it sits between the browser and the files, and
   when a page is requested it inserts the button just before </body>.

   Nothing in any tool file has to change, and no tool has to be edited again when one
   is added.

   IT FAILS OPEN. Every step is wrapped so that if anything at all goes wrong, the
   original response is passed through untouched. The worst case is a page with no
   button, never a page that will not load.

   Two limits worth knowing:
     - A service worker needs https or localhost. Opened straight from disk with a
       file:// address it will not register, so tools opened that way only show the
       button if it is already built into the file.
     - A PDF is rendered by the browser's own viewer and cannot carry a button, so PDFs
       are left alone and the portal opens them in a new tab instead.
   ══════════════════════════════════════════════════════════════════════════ */
const SW_VERSION = 'mainmenu-v1';

/* The button, as a string, because it is injected into someone else's document. */
const MENU_SNIPPET = `
<script>
(function(){var K='__nmcpHomeBtn';if(window[K])return;window[K]=1;
var q=new URLSearchParams(location.search),h=q.get('home')||'index.html';
if(/^[a-z]+:/i.test(h)||h.indexOf('//')===0)h='index.html';
function go(){var e=function(k){var v=q.get(k);return v?'&'+k+'='+encodeURIComponent(v):'';};
location.href=h+(h.indexOf('?')>=0?'&':'?')+'back=1'+e('tab')+e('role');}
window.nmcpGoHome=go;
function build(){if(document.getElementById('nmcpHomeBtn'))return;
var s=document.createElement('style');s.textContent='#nmcpHomeBtn{position:fixed;top:14px;right:16px;z-index:99999;display:inline-flex;align-items:center;gap:7px;background:#2c6793;color:#fff;border:none;border-radius:9px;padding:9px 16px;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.28)}#nmcpHomeBtn:hover{background:#1f4a6a}#nmcpHomeBtn:focus-visible{outline:3px solid #ffc107;outline-offset:2px}@media print{#nmcpHomeBtn{display:none}}@media (max-width:600px){#nmcpHomeBtn{top:10px;right:10px;padding:8px 12px;font-size:12px}}';
document.head.appendChild(s);
var b=document.createElement('button');b.id='nmcpHomeBtn';b.type='button';
b.title='Back to the main menu (Alt+H)';b.setAttribute('aria-label','Back to the main menu');
b.innerHTML='<span aria-hidden="true">&#8962;</span> Main menu';
b.addEventListener('click',go);document.body.appendChild(b);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
document.addEventListener('keydown',function(e){if(e.altKey&&(e.key==='h'||e.key==='H')){e.preventDefault();go();}});
})();
<\/script>
`;

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  // Take over pages that are already open, so the first tool click works without a reload.
  e.waitUntil(self.clients.claim());
});

/* Which requests should get the button. Only a page the user navigated to, on this site,
   that is not the portal itself. */
function shouldInject(request) {
  try {
    if (request.method !== 'GET') return false;
    if (request.mode !== 'navigate') return false;          // not sub-resources
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;  // never another site
    const path = url.pathname.toLowerCase();
    if (path.endsWith('.pdf')) return false;                // the pdf viewer cannot take it
    const file = path.split('/').pop() || '';
    // the portal already has its own Main menu button in the sidebar
    if (file === '' || file === 'index.html' || file === 'index.htm') return false;
    // only pages: a file with no extension is treated as a page too
    return file.endsWith('.html') || file.endsWith('.htm') || !file.includes('.');
  } catch (err) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  if (!shouldInject(event.request)) return;                 // leave everything else alone

  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(event.request);
    } catch (err) {
      throw err;                                            // offline: let the browser say so
    }
    try {
      if (!response.ok) return response;
      const type = response.headers.get('content-type') || '';
      // Only touch html. Anything else, including a pdf served without a .pdf path, passes through.
      if (!type.toLowerCase().includes('text/html')) return response;

      const html = await response.clone().text();
      if (html.includes('__nmcpHomeBtn')) return response;   // already has one, do not add a second

      const i = html.toLowerCase().lastIndexOf('</body>');
      const out = (i >= 0)
        ? html.slice(0, i) + MENU_SNIPPET + html.slice(i)
        : html + MENU_SNIPPET;                               // no body tag: append at the end

      const headers = new Headers(response.headers);
      headers.delete('content-length');                      // the body is longer now
      return new Response(out, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      return response;                                       // anything unexpected: serve as is
    }
  })());
});
