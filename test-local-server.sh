#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"

python3 - "$ROOT_DIR" "$HOST" "$PORT" <<'PY'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse
import html
import os
import re
import sys

root = Path(sys.argv[1]).resolve()
host = sys.argv[2]
port = int(sys.argv[3])


def inline_markdown(text):
    escaped = html.escape(text)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: (
            f'<a href="{html.escape(match.group(2), quote=True)}">'
            f"{match.group(1)}</a>"
        ),
        escaped,
    )
    return escaped


def render_index_md():
    index_path = root / "index.md"
    if not index_path.exists():
        return None

    body = []
    paragraph = []

    def flush_paragraph():
        if paragraph:
            body.append(f"<p>{inline_markdown(' '.join(paragraph))}</p>")
            paragraph.clear()

    for raw_line in index_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            continue

        if line == "---":
            flush_paragraph()
            body.append("<hr>")
            continue

        if line.startswith("### "):
            flush_paragraph()
            body.append(f"<h3>{inline_markdown(line[4:])}</h3>")
            continue

        if line.startswith("## "):
            flush_paragraph()
            body.append(f"<h2>{inline_markdown(line[3:])}</h2>")
            continue

        if line.startswith("# "):
            flush_paragraph()
            body.append(f"<h1>{inline_markdown(line[2:])}</h1>")
            continue

        paragraph.append(line)

    flush_paragraph()

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kai Lauterbach</title>
  <style>
    :root {{
      --bg: #f5f7fb;
      --surface: #ffffff;
      --line: #dce3ed;
      --text: #18202a;
      --muted: #5c6977;
      --primary: #1f6feb;
    }}

    * {{
      box-sizing: border-box;
    }}

    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.65;
    }}

    main {{
      max-width: 880px;
      margin: 56px auto;
      padding: 40px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }}

    h1 {{
      margin: 0 0 16px;
      font-size: clamp(34px, 5vw, 56px);
      line-height: 1.12;
      letter-spacing: 0;
    }}

    h2 {{
      margin-top: 34px;
      font-size: 25px;
      line-height: 1.25;
    }}

    h3 {{
      margin-top: 26px;
      font-size: 19px;
    }}

    p {{
      color: var(--muted);
    }}

    a {{
      color: var(--primary);
      font-weight: 700;
      text-decoration: none;
    }}

    hr {{
      margin: 32px 0;
      border: 0;
      border-top: 1px solid var(--line);
    }}

    .local-links {{
      margin-top: 34px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }}

    .local-links a {{
      padding: 10px 14px;
      background: #eef3f8;
      border-radius: 999px;
    }}

    @media (max-width: 640px) {{
      main {{
        margin: 0;
        padding: 28px 20px;
        border: 0;
        border-radius: 0;
      }}
    }}
  </style>
</head>
<body>
  <main>
    {''.join(body)}
    <nav class="local-links" aria-label="Local preview links">
      <a href="/ai-workshop/">AI Workshop</a>
      <a href="/ai-workshop/workshops.html">Workshops</a>
    </nav>
  </main>
</body>
</html>
"""


class LocalPreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)

        if request_path in {"/", "/index.html"}:
            content = render_index_md()
            if content is not None:
                encoded = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
                return

        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


os.chdir(root)

try:
    server = ThreadingHTTPServer((host, port), LocalPreviewHandler)
except OSError as exc:
    print(f"Could not start local server on http://{host}:{port}: {exc}", file=sys.stderr)
    sys.exit(1)

print(f"Local preview server running on http://{host}:{port}/")
print(f"Workshop area: http://{host}:{port}/ai-workshop/")
print(f"Workshops:     http://{host}:{port}/ai-workshop/workshops.html")
print("Press Ctrl+C to stop.")

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nStopping local preview server.")
finally:
    server.server_close()
PY
