#!/usr/bin/env python3
"""Keep index.html's Content-Security-Policy honest.

GitHub Pages cannot set response headers, so Orbit's CSP has to travel in a
<meta http-equiv> tag. That rules out Report-Only mode — a meta CSP is always
enforcing — and it means a policy that is wrong does not warn anybody, it just
white-screens the app for everyone on the next push.

The fragile part is script-src. The policy names the SHA-256 of each inline
<script> in index.html instead of allowing 'unsafe-inline', which is what makes
an injected <script> useless to an attacker — but it also means editing either
inline block invalidates the policy.

So:

    python tools/csp.py --check     exit 1 if the meta tag is stale   (CI)
    python tools/csp.py --write     recompute and rewrite the meta tag

Run --write after touching an inline script in index.html. CI runs --check on
every push and fails loudly if you forgot.
"""
import base64, hashlib, io, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'index.html'
MARK = 'Content-Security-Policy'

# Everything except script-src, which is generated. Order is cosmetic.
STATIC = [
    # Deny by default and name each exception, so a directive nobody thought
    # about fails closed instead of inheriting something permissive.
    ("default-src", "'none'"),
    # htm builds elements with style="..." attributes all over the app, and
    # style-src governs style ATTRIBUTES too. Style injection is a far smaller
    # prize than script injection, so this is the one place unsafe-inline stays.
    # cdnjs serves MapLibre's stylesheet. Leaving it out (2026-09-16 to -24)
    # blocked that file, so .maplibregl-marker lost `position:absolute` and
    # every pin was laid out in normal flow and slid about whenever the map zoomed.
    ("style-src", "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com"),
    ("font-src", "'self' data: https://fonts.gstatic.com"),
    # Avatars, covers and chat backgrounds are URLs people paste themselves, so
    # this cannot be an allowlist of hosts. https: still rules out http: and
    # keeps the page from being downgraded.
    ("img-src", "'self' data: blob: https:"),
    ("media-src", "'self' data: blob: https:"),
    # The exfiltration boundary. Even if something did manage to run script in
    # the page, this is the list of places it could send what it found.
    ("connect-src", "'self' "
                    "https://zdlevrezefagfqhflusj.supabase.co "
                    "wss://zdlevrezefagfqhflusj.supabase.co "
                    "https://tiles.openfreemap.org "
                    "https://tenor.googleapis.com "
                    # live connections (connect.js): Discord presence via Lanyard, GitHub profile
                    "https://api.lanyard.rest "
                    "https://api.github.com "
                    "https://esm.sh "
                    "https://cdnjs.cloudflare.com"),
    # MapLibre GL runs its tile parser in a worker built from a blob: URL.
    ("worker-src", "'self' blob:"),
    ("child-src", "'self' blob:"),
    ("manifest-src", "'self'"),
    ("frame-src", "'none'"),
    # Stops an injected <base> from re-pointing every relative URL in the app.
    ("base-uri", "'none'"),
    # Orbit posts nothing to a server form; auth goes through supabase-js.
    ("form-action", "'none'"),
    ("object-src", "'none'"),
    ("upgrade-insecure-requests", ""),
]

# frame-ancestors, report-uri, report-to and sandbox are IGNORED when a policy
# arrives in a meta tag, so there is no point listing them here. Clickjacking
# therefore has to be handled another way — see the frame-buster note in
# index.html.

SCRIPT_HOSTS = "'self' https://esm.sh https://cdnjs.cloudflare.com"


def inline_scripts(html):
    """Every inline <script> body, importmap included — both need a hash."""
    out = []
    for m in re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', html, re.S | re.I):
        out.append(m.group(2))
    return out


def sha(body):
    d = hashlib.sha256(body.encode('utf-8')).digest()
    return "'sha256-" + base64.b64encode(d).decode('ascii') + "'"


def policy(html):
    hashes = ' '.join(sha(b) for b in inline_scripts(html))
    parts = [f"script-src {SCRIPT_HOSTS} {hashes}".rstrip()]
    for k, v in STATIC:
        parts.append(f"{k} {v}".strip())
    return '; '.join(parts)


def strip_meta(html):
    return re.sub(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', html, flags=re.I)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else '--check'
    html = io.open(HTML, encoding='utf-8').read()

    # The hashes must describe the file WITHOUT the meta tag in it, or writing
    # the tag would change the thing the tag is describing.
    bare = strip_meta(html)
    want = policy(bare)

    found = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)">', html, re.I)
    have = found.group(1) if found else None

    if mode == '--check':
        if have == want:
            print('CSP up to date ({} inline script hash(es))'.format(len(inline_scripts(bare))))
            return 0
        print('CSP in index.html is STALE.\n', file=sys.stderr)
        print('  have: {}\n'.format(have), file=sys.stderr)
        print('  want: {}\n'.format(want), file=sys.stderr)
        print('Run:  python tools/csp.py --write', file=sys.stderr)
        return 1

    if mode == '--write':
        tag = '<meta http-equiv="Content-Security-Policy" content="{}">\n'.format(want)
        # Sits immediately after <meta charset>, which must come first. Spliced
        # by index rather than re.sub, so a policy full of quotes and slashes is
        # never read as a replacement template.
        anchor = re.search(r'<meta charset="[^"]*">\r?\n', bare, re.I)
        if not anchor:
            print('could not find <meta charset> to anchor to', file=sys.stderr)
            return 1
        out = bare[:anchor.end()] + tag + bare[anchor.end():]
        io.open(HTML, 'w', encoding='utf-8', newline='').write(out)
        print('wrote CSP ({} inline script hash(es))'.format(len(inline_scripts(bare))))
        return 0

    print(__doc__)
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
