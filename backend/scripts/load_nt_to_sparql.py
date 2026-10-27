#!/usr/bin/env python3
"""Load one N-Triples file into a SPARQL endpoint with INSERT DATA updates.

Triples are posted in batches to ``--endpoint``. Each batch is a SPARQL 1.1
Update ``INSERT DATA`` into ``--graph``. The script uses the scheme named in
the endpoint's ``WWW-Authenticate`` challenge (Basic or Digest). Virtuoso's
``/sparql-auth`` endpoint challenges with Digest.

Blank nodes are skolemized before sending. SPARQL treats blank nodes as
local to a single update request, so splitting a file across batches would
otherwise split one node into many. Skolem IRIs are derived from the
original blank-node labels and scoped to the target graph, so loading the
same file again does not mint new nodes.

Example::

    python scripts/load_nt_to_sparql.py \\
        --file result.nt \\
        --endpoint http://localhost:3030/ds/update \\
        --credentials admin:secret \\
        --graph http://example.org/graph
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import secrets
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from rdflib import BNode, Graph

_BAD_IRI_CHARS = set('<>"{}|\\^` \t\r\n')
DEFAULT_BATCH_SIZE = 1000
DEFAULT_TIMEOUT = 120.0


class _PreserveBlankNodeLabels(dict[str, str]):
    """Keep N-Triples blank-node labels instead of rdflib's fresh ids.

    The NT parser remaps each ``_:label`` to a new blank node unless the
    context already returns an id. Returning the original label makes
    skolem IRIs stable across runs of the same file.
    """

    def get(self, key: str, default: str | None = None) -> str | None:
        if key not in self:
            self[key] = key
        return super().get(key, default)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path, help="N-Triples file to load")
    parser.add_argument("--endpoint", required=True, help="SPARQL update endpoint URL")
    parser.add_argument(
        "--credentials",
        required=True,
        help="Basic auth credentials as user:password (password may contain ':')",
    )
    parser.add_argument("--graph", required=True, help="Named graph IRI to insert into")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Triples per INSERT DATA request (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT:g})",
    )
    args = parser.parse_args(argv)
    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    return args


def _split_credentials(credentials: str) -> tuple[str, str]:
    user, sep, password = credentials.partition(":")
    if not sep or not user:
        raise SystemExit("credentials must be user:password")
    return user, password


def _validate_graph_iri(iri: str) -> str:
    iri = iri.strip()
    if not iri or any(char in _BAD_IRI_CHARS or ord(char) < 32 for char in iri):
        raise SystemExit(f"invalid named graph IRI: {iri!r}")
    return iri


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def _basic_auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _parse_www_authenticate(header: str) -> tuple[str, dict[str, str]]:
    """Parse one ``WWW-Authenticate`` challenge into a scheme and parameters."""
    scheme, _, rest = header.strip().partition(" ")
    params: dict[str, str] = {}
    index = 0
    while index < len(rest):
        while index < len(rest) and rest[index] in " ,":
            index += 1
        if index >= len(rest):
            break
        equals = rest.find("=", index)
        if equals < 0:
            break
        key = rest[index:equals].strip().lower()
        index = equals + 1
        if index < len(rest) and rest[index] == '"':
            index += 1
            chars: list[str] = []
            while index < len(rest) and rest[index] != '"':
                if rest[index] == "\\" and index + 1 < len(rest):
                    chars.append(rest[index + 1])
                    index += 2
                else:
                    chars.append(rest[index])
                    index += 1
            params[key] = "".join(chars)
            if index < len(rest) and rest[index] == '"':
                index += 1
        else:
            start = index
            while index < len(rest) and rest[index] != ",":
                index += 1
            params[key] = rest[start:index].strip()
    return scheme.lower(), params


def _digest_uri(url: str) -> str:
    parts = urlsplit(url)
    uri = parts.path or "/"
    if parts.query:
        uri += "?" + parts.query
    return uri


def _md5(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()


def _quote_auth(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _digest_header(
    user: str,
    password: str,
    method: str,
    url: str,
    challenge: dict[str, str],
    nc: int,
) -> str:
    realm = challenge.get("realm", "")
    nonce = challenge.get("nonce", "")
    if not realm or not nonce:
        raise SystemExit("Digest challenge is missing realm or nonce")
    algorithm = challenge.get("algorithm", "MD5")
    if algorithm.upper() not in {"MD5", "MD5-SESS"}:
        raise SystemExit(f"unsupported Digest algorithm: {algorithm}")
    qop_values = [item.strip() for item in challenge.get("qop", "").split(",") if item.strip()]
    qop = "auth" if "auth" in qop_values else None
    uri = _digest_uri(url)
    cnonce = secrets.token_hex(8)
    nc_value = f"{nc:08x}"
    ha1 = _md5(f"{user}:{realm}:{password}")
    if algorithm.upper() == "MD5-SESS":
        ha1 = _md5(f"{ha1}:{nonce}:{cnonce}")
    ha2 = _md5(f"{method}:{uri}")
    if qop:
        response = _md5(f"{ha1}:{nonce}:{nc_value}:{cnonce}:{qop}:{ha2}")
    else:
        response = _md5(f"{ha1}:{nonce}:{ha2}")
    fields = [
        f"username={_quote_auth(user)}",
        f"realm={_quote_auth(realm)}",
        f"nonce={_quote_auth(nonce)}",
        f"uri={_quote_auth(uri)}",
        f"algorithm={algorithm}",
        f"response={_quote_auth(response)}",
    ]
    opaque = challenge.get("opaque")
    if opaque is not None:
        fields.append(f"opaque={_quote_auth(opaque)}")
    if qop:
        fields.append(f"qop={qop}")
        fields.append(f"nc={nc_value}")
        fields.append(f"cnonce={_quote_auth(cnonce)}")
    return "Digest " + ", ".join(fields)


@dataclass
class _EndpointAuth:
    """Basic or Digest credentials, negotiated from ``WWW-Authenticate``."""

    user: str
    password: str
    scheme: str | None = None
    challenge: dict[str, str] = field(default_factory=dict)
    nc: int = 0

    def authorization(self, method: str, url: str) -> str | None:
        if self.scheme == "basic":
            return _basic_auth_header(self.user, self.password)
        if self.scheme == "digest":
            self.nc += 1
            return _digest_header(self.user, self.password, method, url, self.challenge, self.nc)
        return None

    def accept_challenge(self, header: str) -> None:
        scheme, params = _parse_www_authenticate(header)
        if scheme not in {"basic", "digest"}:
            raise SystemExit(f"unsupported authentication scheme: {scheme}")
        self.scheme = scheme
        self.challenge = params
        self.nc = 0


def _load_graph(path: Path, graph_iri: str) -> Graph:
    if not path.is_file():
        raise SystemExit(f"file not found: {path}")
    graph = Graph()
    try:
        graph.parse(path, format="nt", bnode_context=_PreserveBlankNodeLabels())
    except Exception as exc:
        raise SystemExit(f"failed to parse {path} as N-Triples: {exc}") from exc

    blank_nodes = {term for triple in graph for term in triple if isinstance(term, BNode)}
    blank_count = len(blank_nodes)
    if blank_count == 0:
        return graph

    scope = hashlib.sha256(graph_iri.encode("utf-8")).hexdigest()[:16]
    skolem = graph.skolemize(basepath=f"/.well-known/genid/{scope}/")
    noun = "blank node" if blank_count == 1 else "blank nodes"
    print(
        f"skolemized {blank_count} {noun} so identity survives batching",
        file=sys.stderr,
    )
    return skolem


def _insert_query(graph_iri: str, triples: list[tuple[object, object, object]]) -> str:
    lines = "\n".join(f"    {subject.n3()} {predicate.n3()} {obj.n3()} ." for subject, predicate, obj in triples)
    return f"INSERT DATA {{\n  GRAPH <{graph_iri}> {{\n{lines}\n  }}\n}}\n"


def _send_update(
    endpoint: str,
    query: str,
    timeout: float,
    authorization: str | None,
) -> tuple[int, str | None, str]:
    headers = {
        "Content-Type": "application/sparql-update; charset=UTF-8",
        "Accept": "*/*",
    }
    if authorization:
        headers["Authorization"] = authorization
    request = urllib.request.Request(
        endpoint,
        data=query.encode("utf-8"),
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace").strip()
            return response.status, None, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace").strip()
        challenge = exc.headers.get("WWW-Authenticate")
        return exc.code, challenge, body
    except urllib.error.URLError as exc:
        raise SystemExit(f"could not reach SPARQL endpoint: {exc.reason}") from exc


def _fail_update(status: int, body: str, scheme: str | None) -> None:
    detail = f": {body}" if body else ""
    if status == 401:
        raise SystemExit(f"SPARQL authentication failed ({scheme or 'the endpoint'}){detail}")
    raise SystemExit(f"SPARQL update failed with HTTP {status}{detail}")


def _post_update(
    endpoint: str,
    auth: _EndpointAuth,
    query: str,
    timeout: float,
) -> None:
    """POST one SPARQL update, answering a Basic or Digest challenge."""
    status, challenge, body = _send_update(
        endpoint, query, timeout, auth.authorization("POST", endpoint)
    )
    if status < 400:
        return
    if status == 401 and not challenge:
        # Virtuoso omits WWW-Authenticate when an Authorization header was sent.
        status, challenge, body = _send_update(endpoint, query, timeout, None)
        if status < 400:
            return
    if status != 401 or not challenge:
        _fail_update(status, body, auth.scheme)
    auth.accept_challenge(challenge)
    status, challenge, body = _send_update(
        endpoint, query, timeout, auth.authorization("POST", endpoint)
    )
    if status < 400:
        return
    if status == 401 and challenge:
        _, params = _parse_www_authenticate(challenge)
        if params.get("stale", "").lower() != "true":
            _fail_update(status, body, auth.scheme)
        auth.accept_challenge(challenge)
        status, _, body = _send_update(
            endpoint, query, timeout, auth.authorization("POST", endpoint)
        )
        if status < 400:
            return
    _fail_update(status, body, auth.scheme)


def load_nt(
    path: Path,
    endpoint: str,
    user: str,
    password: str,
    graph_iri: str,
    batch_size: int,
    timeout: float,
) -> int:
    graph = _load_graph(path, graph_iri)
    total = len(graph)
    if total == 0:
        print(f"no triples in {path}; nothing to insert", file=sys.stderr)
        return 0

    batches = (total + batch_size - 1) // batch_size
    print(
        f"inserting {total} triples from {path} into <{graph_iri}> "
        f"({batches} request{'s' if batches != 1 else ''})",
        file=sys.stderr,
    )
    auth = _EndpointAuth(user, password)
    batch: list[tuple[object, object, object]] = []
    sent = 0
    batch_no = 0
    for triple in graph:
        batch.append(triple)
        if len(batch) < batch_size:
            continue
        batch_no += 1
        print(
            f"POST batch {batch_no}/{batches} ({_count(len(batch), 'triple')})",
            file=sys.stderr,
        )
        _post_update(endpoint, auth, _insert_query(graph_iri, batch), timeout)
        sent += len(batch)
        batch = []
    if batch:
        batch_no += 1
        print(
            f"POST batch {batch_no}/{batches} ({_count(len(batch), 'triple')})",
            file=sys.stderr,
        )
        _post_update(endpoint, auth, _insert_query(graph_iri, batch), timeout)
        sent += len(batch)
    print(f"inserted {sent} triples into <{graph_iri}>", file=sys.stderr)
    return sent


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    user, password = _split_credentials(args.credentials)
    graph_iri = _validate_graph_iri(args.graph)
    load_nt(
        path=args.file,
        endpoint=args.endpoint,
        user=user,
        password=password,
        graph_iri=graph_iri,
        batch_size=args.batch_size,
        timeout=args.timeout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
