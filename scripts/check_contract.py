#!/usr/bin/env python3
"""Contract check: every API call the frontend makes must exist on the backend.

The frontend is plain JavaScript and the backend is Python, so nothing in the
toolchain would otherwise catch a renamed route or a wrong verb — it would
surface as a 404 in a browser, in whichever screen nobody opened during
testing. This script closes that gap and is wired into CI.

It works by:
  1. importing the FastAPI app and reading its real OpenAPI schema, and
  2. parsing `frontend/src/api/endpoints.js` for every url/method pair.

Then it matches path templates, so `/vendor/queues/${id}` matches the declared
`/vendor/queues/{queue_id}`.

Exit code 0 = the two sides agree.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
ENDPOINTS_JS = ROOT / "frontend" / "src" / "api" / "endpoints.js"

# Frontend calls are written as: { url: '/thing', method: 'POST', ... }
URL_RE = re.compile(r"url:\s*[`'\"]([^`'\"]+)[`'\"]")
METHOD_RE = re.compile(r"method:\s*['\"](\w+)['\"]")

# Template literal segments -> a wildcard, e.g. /vendor/queues/${id} -> /vendor/queues/*
TEMPLATE_RE = re.compile(r"\$\{[^}]+\}")
PARAM_RE = re.compile(r"\{[^}]+\}")


def load_backend_routes() -> set[tuple[str, str]]:
    sys.path.insert(0, str(BACKEND))
    from app.main import create_app  # noqa: E402

    app = create_app()
    schema = app.openapi()
    prefix = "/api/v1"

    routes: set[tuple[str, str]] = set()
    for path, operations in schema["paths"].items():
        trimmed = path[len(prefix):] if path.startswith(prefix) else path
        for method in operations:
            routes.add((method.upper(), trimmed))
    return routes


def normalise(path: str) -> str:
    """Reduce a path to a comparable shape by blanking out its parameters."""
    path = TEMPLATE_RE.sub("*", path)
    path = PARAM_RE.sub("*", path)
    return path.rstrip("/") or "/"


def extract_frontend_calls() -> list[tuple[str, str, int]]:
    """Return (METHOD, url, line_number) for every call in endpoints.js.

    The method must be read from the *same* config object as the url. Scanning
    a fixed window of following lines picks up the next function's method and
    reports nonsense, so we walk braces to find where this object ends.
    """
    source = ENDPOINTS_JS.read_text(encoding="utf-8")
    calls: list[tuple[str, str, int]] = []

    for match in re.finditer(r"request(?:Page)?\(\s*\{", source):
        start = match.end() - 1  # position of the opening brace
        depth = 0
        end = start
        for index in range(start, len(source)):
            char = source[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index
                    break

        config = source[start : end + 1]
        url_match = URL_RE.search(config)
        if not url_match:
            continue
        method_match = METHOD_RE.search(config)
        method = method_match.group(1).upper() if method_match else "GET"
        line_number = source.count("\n", 0, match.start()) + 1
        calls.append((method, url_match.group(1), line_number))

    return calls


def main() -> int:
    backend = load_backend_routes()
    backend_normalised = {(m, normalise(p)) for m, p in backend}
    calls = extract_frontend_calls()

    problems: list[str] = []
    for method, url, line in calls:
        key = (method, normalise(url))
        if key not in backend_normalised:
            problems.append(
                f"  endpoints.js:{line}  {method} {url}\n"
                f"      no matching backend route (looked for {method} {normalise(url)})"
            )

    print(f"Backend routes declared : {len(backend)}")
    print(f"Frontend calls found    : {len(calls)}")

    if problems:
        print(f"\nMISMATCHES ({len(problems)}):\n")
        print("\n".join(problems))
        print("\nContract check FAILED.")
        return 1

    # Also report backend routes the frontend never touches. Not a failure —
    # it just shows how much of the API still has no UI behind it.
    used = {(m, normalise(u)) for m, u, _ in calls}
    unused = sorted(backend_normalised - used)
    print(f"Unused backend routes   : {len(unused)}")
    if "-v" in sys.argv:
        for method, path in unused:
            print(f"    {method:6} {path}")

    print("\nContract check PASSED — every frontend call maps to a real route.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
