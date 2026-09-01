// The back end of the editing system.
//
// One job: hand a GitHub token to a browser that has already proved, to
// Cloudflare Access, that it belongs to somebody on the allow-list. That
// indirection is the whole point — it is what lets a client sign in with an
// email address and never learn what GitHub is.
//
// The security rests on one thing being true: this endpoint must sit behind an
// Access application. If it does not, it is an open door to a repository. So it
// refuses to answer at all unless it can verify an Access token, rather than
// falling back to serving the secret. A misconfiguration should cost an
// editor's afternoon, not the client's site.

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache = { at: 0, keys: null };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

function b64urlToBytes(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// Cloudflare publishes the public keys its Access tokens are signed with. They
// rotate, so they are fetched rather than pinned, and cached for an hour so a
// busy editor does not hit the endpoint on every save.
async function accessKeys(teamDomain) {
  if (certsCache.keys && Date.now() - certsCache.at < CERTS_TTL_MS) return certsCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`could not fetch Access certs: ${res.status}`);
  const { keys } = await res.json();
  certsCache = { at: Date.now(), keys };
  return keys;
}

// Verify the JWT Cloudflare Access attaches to every request it lets through.
// Checking the signature is not optional: without it anyone could present a
// token with the right shape and be believed.
async function verifyAccess(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion')
    || (request.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return { ok: false, why: 'no Access token on the request' };

  const [rawHeader, rawPayload, rawSig] = token.split('.');
  if (!rawHeader || !rawPayload || !rawSig) return { ok: false, why: 'malformed Access token' };

  let header;
  let payload;
  try {
    header = decodeJson(rawHeader);
    payload = decodeJson(rawPayload);
  } catch {
    return { ok: false, why: 'unreadable Access token' };
  }

  if (payload.aud && env.ACCESS_AUD && !([].concat(payload.aud)).includes(env.ACCESS_AUD)) {
    return { ok: false, why: 'token is for a different Access application' };
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return { ok: false, why: 'Access token has expired' };

  const keys = await accessKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, why: 'Access token signed by an unknown key' };

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const signed = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(rawSig), signed);
  if (!valid) return { ok: false, why: 'Access token signature does not verify' };

  return { ok: true, email: payload.email || null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/cms-health') {
      // Deliberately says whether it is configured, never what with. Enough to
      // diagnose a deployment, useless to anyone else.
      return json({
        ok: true,
        configured: {
          githubToken: Boolean(env.GITHUB_TOKEN),
          accessTeamDomain: Boolean(env.ACCESS_TEAM_DOMAIN),
          accessAud: Boolean(env.ACCESS_AUD),
        },
      });
    }

    if (url.pathname !== '/cms-token') return json({ error: 'not found' }, 404);

    // Refuse rather than degrade. An unconfigured deployment must not be a
    // deployment that hands the token to anybody who asks.
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return json({ error: 'This endpoint is not protected by Cloudflare Access yet, so it will not issue a token.' }, 503);
    }
    if (!env.GITHUB_TOKEN) return json({ error: 'no GitHub token configured' }, 503);

    let access;
    try {
      access = await verifyAccess(request, env);
    } catch (err) {
      return json({ error: `could not verify Access: ${err.message}` }, 502);
    }
    if (!access.ok) return json({ error: access.why }, 401);

    return json({ token: env.GITHUB_TOKEN, email: access.email });
  },
};
