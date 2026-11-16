/**
 * Strava token-exchange proxy for the Breakside app.
 *
 * WHY THIS FILE EXISTS
 * Strava's OAuth code-to-token exchange requires your client secret. A
 * single-file client-side dashboard cannot hold a secret — anyone who opens the
 * file can read it, and a leaked secret lets a third party impersonate your app
 * against every user who ever authorized it. So the exchange runs here instead,
 * on infrastructure you control, and the dashboard only ever sees the resulting
 * short-lived access token.
 *
 * DEPLOY (Cloudflare Workers — free tier is plenty for one athlete)
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler init breakside-strava --no-git    (then replace src/index.js with this file)
 *   3. wrangler secret put STRAVA_CLIENT_SECRET
 *      wrangler secret put STRAVA_CLIENT_ID
 *   4. wrangler deploy
 *   5. In Strava (https://www.strava.com/settings/api) set the Authorization
 *      Callback Domain to your worker's hostname, e.g. breakside-strava.you.workers.dev
 *   6. In the dashboard's Athlete tab, set:
 *        Strava client ID           -> your numeric client ID
 *        Token-exchange proxy URL   -> https://breakside-strava.you.workers.dev
 *      then use "Connect via proxy".
 *
 * ROUTES
 *   GET /callback?code=...&state=<dashboard url>
 *       Exchanges the code for tokens and redirects back to the dashboard with
 *       the access token in the URL fragment (fragments are not sent to servers
 *       or written to server logs, unlike query strings).
 *   POST /refresh   body: {"refresh_token": "..."}
 *       Returns a fresh access token as JSON. The token travels in the body so
 *       it stays out of URLs and request logs. The older
 *       GET /refresh?refresh_token=... form still works for dashboards that
 *       have not been updated.
 *
 * SECURITY NOTES
 *   - ALLOWED_REDIRECT_HOSTS is an allowlist. Without it, anyone could pass
 *     their own URL as `state` and have your worker hand them a token. Set it to
 *     wherever you actually host the dashboard: for the Pi that is its name on
 *     your network (raspberrypi.local) and, if you installed the app over
 *     Tailscale, its ts.net name too. Redeploy after changing it.
 *   - Anything echoed into an error page is HTML-escaped, so a crafted link to
 *     /callback?error=... cannot run script on the worker's address.
 *   - The refresh token is returned to the client in the fragment as well. If
 *     you would rather it never leave the server, store it in a KV namespace
 *     keyed by athlete id and have /refresh read it from there instead.
 *   - This grants scope activity:read_all, which includes private activities.
 *     Drop to activity:read in the dashboard's auth URL if you do not want that.
 */

// Hosts allowed as a post-auth redirect target. 'null' and 'localhost' entries
// let you test from a local file or dev server; remove them for production.
const ALLOWED_REDIRECT_HOSTS = [
  'localhost',
  '127.0.0.1',
  // 'raspberrypi.local',                  // the Pi on your home network
  // 'raspberrypi.your-tailnet.ts.net',    // the Pi over Tailscale (installed app)
];

function isAllowedRedirect(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol === 'file:') return true; // opening the html file directly
    return ALLOWED_REDIRECT_HOSTS.includes(u.hostname);
  } catch (e) {
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function html(status, body) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:32px;max-width:40em">' +
      body +
      '</body>',
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      // Needed so the dashboard can call /refresh from the browser.
      'access-control-allow-origin': '*',
    },
  });
}

async function exchangeCode(env, code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function refreshToken(env, refresh_token) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      return html(500, '<h1>Not configured</h1><p>Set the STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET secrets on this worker.</p>');
    }

    // ---- OAuth callback ----
    if (url.pathname === '/callback') {
      const error = url.searchParams.get('error');
      if (error) return html(400, '<h1>Strava returned an error</h1><p>' + escapeHtml(error) + '</p>');

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') || '';
      if (!code) return html(400, '<h1>Missing code</h1>');

      if (!isAllowedRedirect(state)) {
        return html(
          400,
          '<h1>Redirect target not allowed</h1><p>Add the dashboard host to ALLOWED_REDIRECT_HOSTS in the worker and redeploy. ' +
            'This check is what stops someone else pointing your worker at their own site to harvest a token.</p>'
        );
      }

      const out = await exchangeCode(env, code);
      if (!out.ok) {
        return html(502, '<h1>Token exchange failed (' + out.status + ')</h1><pre>' + escapeHtml(JSON.stringify(out.data, null, 2)) + '</pre>');
      }

      const frag = new URLSearchParams({
        strava_token: out.data.access_token || '',
        expires_at: String(out.data.expires_at || ''),
        refresh_token: out.data.refresh_token || '',
      });
      return new Response(null, {
        status: 302,
        headers: { location: state + '#' + frag.toString() },
      });
    }

    // ---- Token refresh ----
    if (url.pathname === '/refresh') {
      let rt = url.searchParams.get('refresh_token');
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          rt = body && typeof body.refresh_token === 'string' ? body.refresh_token : null;
        } catch (e) {
          rt = null;
        }
      }
      if (!rt) return json(400, { error: 'missing refresh_token' });
      const out = await refreshToken(env, rt);
      if (!out.ok) return json(502, { error: 'refresh failed', status: out.status, detail: out.data });
      return json(200, {
        access_token: out.data.access_token,
        expires_at: out.data.expires_at,
        refresh_token: out.data.refresh_token,
      });
    }

    return html(
      200,
      '<h1>Breakside — Strava proxy</h1>' +
        '<p>Running. Routes: <code>/callback</code> (OAuth redirect target) and <code>/refresh</code>.</p>' +
        '<p>Set this origin as the proxy base URL in the dashboard, and set your Strava app\'s Authorization Callback Domain to <code>' +
        escapeHtml(url.hostname) +
        '</code>.</p>'
    );
  },
};
