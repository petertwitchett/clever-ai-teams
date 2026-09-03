"""Sandboxed execution of dynamically generated Python skills.

Pluggable isolation backends (``SANDBOX_BACKEND`` = auto | docker | subprocess):

**docker** — ephemeral hardened container via the Docker Engine API over the
unix socket (no docker CLI needed): network disabled, read-only rootfs,
``CapDrop: ALL``, ``no-new-privileges``, memory/CPU/pids quotas, non-root
user, tmpfs /tmp (noexec), force-removed after the run.

**subprocess** — ``python -I -S`` child process with RLIMIT_AS / RLIMIT_CPU /
RLIMIT_NPROC=0 / RLIMIT_FSIZE, guarded ``__import__`` allowlist, stripped
builtins, wall-clock timeout and output caps.

**auto** (default) — docker when the socket at ``SANDBOX_DOCKER_SOCKET`` is
reachable, otherwise subprocess. A docker failure fails over to subprocess for
that call. On platforms without a Docker socket (e.g. Clever Cloud Docker
apps) the subprocess backend is the deployed strategy.

Defense-in-depth in both backends: AST validation (import allowlist, forbidden
calls/attributes) always runs before any execution.
"""

from __future__ import annotations

import ast
import asyncio
import json
import sys
import tempfile
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.errors import SandboxExecutionError, ValidationFailedError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ------------------------------------------------------------ AST validation --

_FORBIDDEN_IMPORTS = {
    "subprocess", "ctypes", "multiprocessing", "socketserver", "pty", "pickle",
    "marshal", "shelve", "importlib", "signal", "resource", "gc", "threading",
}
_FORBIDDEN_IMPORTS_NO_NET = _FORBIDDEN_IMPORTS | {"socket", "http", "urllib", "ftplib", "smtplib", "telnetlib", "requests", "httpx", "aiohttp"}
_FORBIDDEN_CALLS = {"eval", "exec", "compile", "__import__", "open", "input", "breakpoint", "globals", "locals", "vars", "setattr", "delattr", "memoryview"}
_FORBIDDEN_ATTRIBUTES = {"__subclasses__", "__globals__", "__code__", "__closure__", "__builtins__", "__loader__", "__spec__", "mro", "__mro__", "__bases__", "__base__", "__dict__", "__class__", "__init_subclass__", "__reduce__", "__reduce_ex__", "__getattribute__", "system", "popen", "fork", "execv", "execve", "spawn"}

_ALLOWED_MODULES = {
    "math", "statistics", "random", "json", "re", "string", "textwrap", "datetime",
    "time", "itertools", "functools", "collections", "heapq", "bisect", "array",
    "copy", "decimal", "fractions", "numbers", "operator", "uuid", "hashlib",
    "base64", "binascii", "struct", "unicodedata", "difflib", "csv", "io",
    "typing", "dataclasses", "enum", "abc", "zlib", "gzip", "secrets", "html",
    "xml", "urllib.parse",
}


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
    functions: list[str] = field(default_factory=list)


def validate_skill_code(code: str, *, allow_network: bool = False) -> ValidationResult:
    """Statically screen skill code with the AST parser."""
    errors: list[str] = []
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return ValidationResult(valid=False, errors=[f"Syntax error: {exc}"])

    forbidden_imports = _FORBIDDEN_IMPORTS if allow_network else _FORBIDDEN_IMPORTS_NO_NET
    functions: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif node.module:
                names = [node.module]
            for name in names:
                root = name.split(".")[0]
                if root == "os" or root == "sys" or root == "shutil" or root == "pathlib" or root == "tempfile" or root == "glob":
                    errors.append(f"Forbidden import: {name} (filesystem/OS access is not allowed)")
                elif root in forbidden_imports:
                    errors.append(f"Forbidden import: {name}")
                elif root not in _ALLOWED_MODULES and name not in _ALLOWED_MODULES:
                    errors.append(f"Import not in allowlist: {name}")
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in _FORBIDDEN_CALLS:
                errors.append(f"Forbidden call: {func.id}()")
        elif isinstance(node, ast.Attribute):
            if node.attr in _FORBIDDEN_ATTRIBUTES:
                errors.append(f"Forbidden attribute access: .{node.attr}")
        elif isinstance(node, ast.Name):
            if node.id in ("__builtins__",):
                errors.append("Forbidden name: __builtins__")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            errors.append("Global/nonlocal statements are not allowed")

    # dedupe, keep order
    seen: set[str] = set()
    unique_errors = [e for e in errors if not (e in seen or seen.add(e))]
    return ValidationResult(valid=not unique_errors, errors=unique_errors, functions=functions)


# ------------------------------------------------------------ sandbox runner --

def _build_harness(max_memory_mb: int, cpu_limit: int, allowed_modules: set[str]) -> str:
    return textwrap.dedent(
        f"""
        import json, sys, resource, builtins

        MAX_MEM = {max_memory_mb} * 1024 * 1024
        try:
            resource.setrlimit(resource.RLIMIT_AS, (MAX_MEM, MAX_MEM))
        except (ValueError, OSError):
            pass
        try:
            resource.setrlimit(resource.RLIMIT_CPU, ({cpu_limit}, {cpu_limit}))
        except (ValueError, OSError):
            pass
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
        except (ValueError, OSError):
            pass
        try:
            resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
        except (ValueError, OSError):
            pass

        _real_exec = exec
        _real_compile = compile
        _ALLOWED = {sorted(allowed_modules)!r}
        _real_import = builtins.__import__

        # Pre-import the allowlist so stdlib-internal C modules (_io, _csv, ...)
        # are already resolved before the guard is installed.
        for _mod in _ALLOWED:
            try:
                _real_import(_mod)
            except Exception:
                pass

        def _guarded_import(name, *args, **kwargs):
            root = name.split('.')[0]
            if root in _ALLOWED or name in _ALLOWED or name in sys.modules or root in sys.modules:
                return _real_import(name, *args, **kwargs)
            raise ImportError("import of '" + name + "' is not permitted in the sandbox")

        payload = json.loads(sys.stdin.read())
        code = payload["code"]
        entrypoint = payload["entrypoint"]
        arguments = payload.get("arguments") or {{}}

        builtins.__import__ = _guarded_import
        for _name in ("open", "input", "breakpoint"):
            try:
                setattr(builtins, _name, None)
            except Exception:
                pass

        namespace = {{"__name__": "__skill__"}}
        try:
            compiled = _real_compile(code, "<skill>", "exec")
            _real_exec(compiled, namespace)
            fn = namespace.get(entrypoint)
            if fn is None:
                print(json.dumps({{"ok": False, "error": "entrypoint '" + entrypoint + "' not found"}}))
                sys.exit(3)
            result = fn(**arguments)
            try:
                serialized = json.dumps(result, default=str, ensure_ascii=False)
            except (TypeError, ValueError):
                serialized = json.dumps(str(result), ensure_ascii=False)
            print("\\n__SKILL_RESULT__" + serialized)
        except SystemExit:
            raise
        except BaseException as exc:
            print(json.dumps({{"ok": False, "error": type(exc).__name__ + ": " + str(exc)[:2000]}}))
            sys.exit(4)
        """
    )


@dataclass
class SandboxResult:
    success: bool
    result: Any = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    error: str | None = None
    backend: str = "subprocess"


def _parse_output(stdout: str, stderr: str, duration_ms: int, returncode: Any, backend: str) -> SandboxResult:
    """Shared parsing of harness output for every backend."""
    marker = "__SKILL_RESULT__"
    if marker in stdout:
        printed, _, tail = stdout.rpartition(marker)
        try:
            result = json.loads(tail.strip())
        except json.JSONDecodeError:
            result = tail.strip()
        return SandboxResult(
            success=True, result=result, stdout=printed.strip(), stderr=stderr,
            duration_ms=duration_ms, backend=backend,
        )

    error = None
    combined = (stdout + "\n" + stderr).strip()
    try:
        error_line = next(line for line in stdout.splitlines() if line.strip().startswith("{") and '"ok"' in line)
        error = json.loads(error_line).get("error")
    except (StopIteration, json.JSONDecodeError):
        error = combined[-2000:] if combined else f"Sandbox exited with code {returncode}"
    return SandboxResult(
        success=False, stdout=stdout.strip(), stderr=stderr, duration_ms=duration_ms, error=error, backend=backend
    )


# ------------------------------------------------------- subprocess backend --


async def _run_subprocess(payload: str, timeout: int) -> SandboxResult:
    """Hardened subprocess backend: rlimits + import guard + stripped builtins."""
    harness = _build_harness(settings.SANDBOX_MAX_MEMORY_MB, max(timeout, 1), _ALLOWED_MODULES)

    with tempfile.TemporaryDirectory(prefix="skill-sandbox-") as workdir:
        harness_path = Path(workdir) / "harness.py"
        harness_path.write_text(harness)

        start = time.monotonic()
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-I", "-S", str(harness_path),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir,
                env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1", "HOME": workdir},
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(
                    process.communicate(payload.encode()), timeout=timeout + 2
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return SandboxResult(
                    success=False,
                    error=f"Execution exceeded the {timeout}s time limit.",
                    duration_ms=int((time.monotonic() - start) * 1000),
                    backend="subprocess",
                )
        except OSError as exc:
            raise SandboxExecutionError(f"Failed to spawn sandbox process: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        max_bytes = settings.SANDBOX_MAX_OUTPUT_BYTES
        stdout = stdout_b[:max_bytes].decode(errors="replace")
        stderr = stderr_b[:max_bytes].decode(errors="replace")
        return _parse_output(stdout, stderr, duration_ms, process.returncode, "subprocess")


# ----------------------------------------------------------- docker backend --

_DOCKER_HARNESS = """
import json, os, sys, builtins

_real_exec = exec
_real_compile = compile
_real_import = builtins.__import__
_ALLOWED = json.loads(os.environ["SKILL_ALLOWED"])

for _mod in _ALLOWED:
    try:
        _real_import(_mod)
    except Exception:
        pass

def _guarded_import(name, *args, **kwargs):
    root = name.split('.')[0]
    if root in _ALLOWED or name in _ALLOWED or name in sys.modules or root in sys.modules:
        return _real_import(name, *args, **kwargs)
    raise ImportError("import of '" + name + "' is not permitted in the sandbox")

payload = json.loads(os.environ["SKILL_PAYLOAD"])
code = payload["code"]
entrypoint = payload["entrypoint"]
arguments = payload.get("arguments") or {}

builtins.__import__ = _guarded_import
for _name in ("open", "input", "breakpoint"):
    try:
        setattr(builtins, _name, None)
    except Exception:
        pass

namespace = {"__name__": "__skill__"}
try:
    compiled = _real_compile(code, "<skill>", "exec")
    _real_exec(compiled, namespace)
    fn = namespace.get(entrypoint)
    if fn is None:
        print(json.dumps({"ok": False, "error": "entrypoint '" + entrypoint + "' not found"}))
        sys.exit(3)
    result = fn(**arguments)
    try:
        serialized = json.dumps(result, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        serialized = json.dumps(str(result), ensure_ascii=False)
    print("\\n__SKILL_RESULT__" + serialized)
except SystemExit:
    raise
except BaseException as exc:
    print(json.dumps({"ok": False, "error": type(exc).__name__ + ": " + str(exc)[:2000]}))
    sys.exit(4)
"""


def docker_available() -> bool:
    """True when the Docker Engine socket is reachable."""
    import socket as _socket

    path = settings.SANDBOX_DOCKER_SOCKET
    if not Path(path).exists():
        return False
    try:
        s = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect(path)
        s.close()
        return True
    except OSError:
        return False


def _demux_docker_logs(raw: bytes) -> tuple[str, str]:
    """Demultiplex the Docker attach/logs stream format (8-byte frame headers)."""
    stdout_parts: list[bytes] = []
    stderr_parts: list[bytes] = []
    i = 0
    while i + 8 <= len(raw):
        stream_type = raw[i]
        size = int.from_bytes(raw[i + 4 : i + 8], "big")
        chunk = raw[i + 8 : i + 8 + size]
        (stderr_parts if stream_type == 2 else stdout_parts).append(chunk)
        i += 8 + size
    if not stdout_parts and not stderr_parts:  # non-multiplexed (TTY) fallback
        return raw.decode(errors="replace"), ""
    return (
        b"".join(stdout_parts).decode(errors="replace"),
        b"".join(stderr_parts).decode(errors="replace"),
    )


async def _run_docker(payload: str, timeout: int) -> SandboxResult:
    """Ephemeral-container backend against the Docker Engine API (unix socket).

    Container hardening: no network, read-only rootfs, all capabilities dropped,
    no-new-privileges, pids/memory/cpu quotas, non-root user, auto-removed.
    """
    import httpx

    transport = httpx.AsyncHTTPTransport(uds=settings.SANDBOX_DOCKER_SOCKET)
    start = time.monotonic()
    container_id: str | None = None

    async with httpx.AsyncClient(transport=transport, base_url="http://docker", timeout=30) as client:
        try:
            create = await client.post(
                "/v1.43/containers/create",
                json={
                    "Image": settings.SANDBOX_DOCKER_IMAGE,
                    "Cmd": ["python", "-I", "-S", "-c", _DOCKER_HARNESS],
                    "Env": [
                        f"SKILL_PAYLOAD={payload}",
                        f"SKILL_ALLOWED={json.dumps(sorted(_ALLOWED_MODULES))}",
                        "PYTHONDONTWRITEBYTECODE=1",
                    ],
                    "User": "65534:65534",
                    "WorkingDir": "/tmp",
                    "NetworkDisabled": not settings.SANDBOX_ALLOW_NETWORK,
                    "HostConfig": {
                        "Memory": settings.SANDBOX_MAX_MEMORY_MB * 1024 * 1024,
                        "MemorySwap": settings.SANDBOX_MAX_MEMORY_MB * 1024 * 1024,
                        "NanoCpus": int(settings.SANDBOX_DOCKER_CPUS * 1_000_000_000),
                        "PidsLimit": 16,
                        "NetworkMode": "bridge" if settings.SANDBOX_ALLOW_NETWORK else "none",
                        "ReadonlyRootfs": True,
                        "CapDrop": ["ALL"],
                        "SecurityOpt": ["no-new-privileges"],
                        "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=16m"},
                        "AutoRemove": False,
                    },
                },
            )
            if create.status_code == 404:
                raise SandboxExecutionError(
                    f"Docker image '{settings.SANDBOX_DOCKER_IMAGE}' not present; pull it on the host first."
                )
            create.raise_for_status()
            container_id = create.json()["Id"]

            (await client.post(f"/v1.43/containers/{container_id}/start")).raise_for_status()

            try:
                wait = await client.post(
                    f"/v1.43/containers/{container_id}/wait",
                    params={"condition": "not-running"},
                    timeout=timeout + 5,
                )
                wait.raise_for_status()
                exit_code = wait.json().get("StatusCode", -1)
            except httpx.TimeoutException:
                await client.post(f"/v1.43/containers/{container_id}/kill")
                return SandboxResult(
                    success=False,
                    error=f"Execution exceeded the {timeout}s time limit.",
                    duration_ms=int((time.monotonic() - start) * 1000),
                    backend="docker",
                )

            logs = await client.get(
                f"/v1.43/containers/{container_id}/logs",
                params={"stdout": "1", "stderr": "1"},
            )
            raw = logs.content[: settings.SANDBOX_MAX_OUTPUT_BYTES * 2]
            stdout, stderr = _demux_docker_logs(raw)
            duration_ms = int((time.monotonic() - start) * 1000)
            return _parse_output(
                stdout[: settings.SANDBOX_MAX_OUTPUT_BYTES],
                stderr[: settings.SANDBOX_MAX_OUTPUT_BYTES],
                duration_ms,
                exit_code,
                "docker",
            )
        except httpx.HTTPError as exc:
            raise SandboxExecutionError(f"Docker sandbox API error: {exc}") from exc
        finally:
            if container_id:
                try:
                    await client.delete(f"/v1.43/containers/{container_id}", params={"force": "1"})
                except httpx.HTTPError:  # pragma: no cover - best-effort cleanup
                    pass


# -------------------------------------------------------------- entry point --

_resolved_backend: str | None = None


def resolve_backend() -> str:
    """Pick the sandbox backend: docker when requested/available, else subprocess."""
    global _resolved_backend
    if _resolved_backend is not None:
        return _resolved_backend
    configured = settings.SANDBOX_BACKEND
    if configured == "docker":
        if not docker_available():
            raise SandboxExecutionError(
                "SANDBOX_BACKEND=docker but the Docker socket is unreachable at "
                f"{settings.SANDBOX_DOCKER_SOCKET}"
            )
        _resolved_backend = "docker"
    elif configured == "subprocess":
        _resolved_backend = "subprocess"
    else:  # auto
        _resolved_backend = "docker" if docker_available() else "subprocess"
    logger.info("sandbox_backend_selected", extra={"backend": _resolved_backend, "configured": configured})
    return _resolved_backend


async def run_in_sandbox(
    code: str,
    entrypoint: str,
    arguments: dict[str, Any] | None = None,
    *,
    timeout: int | None = None,
    validate: bool = True,
) -> SandboxResult:
    """Validate and execute skill code in the configured isolation backend.

    Backends:
    - ``docker``     ephemeral hardened container via the Docker Engine API
                     (no network, read-only rootfs, cap-drop ALL, quotas)
    - ``subprocess`` ``python -I -S`` with rlimits + AST/import guards
    - ``auto``       docker when the socket is reachable, otherwise subprocess
    """
    if not settings.SANDBOX_ENABLED:
        raise SandboxExecutionError("Sandbox execution is disabled by configuration.")

    if validate:
        verdict = validate_skill_code(code, allow_network=settings.SANDBOX_ALLOW_NETWORK)
        if not verdict.valid:
            raise ValidationFailedError("Skill code failed AST validation.", details=verdict.errors)
        if entrypoint not in verdict.functions:
            raise ValidationFailedError(
                f"Entrypoint '{entrypoint}' is not defined in the skill code.",
                details={"defined_functions": verdict.functions},
            )

    timeout = timeout or settings.SANDBOX_TIMEOUT
    payload = json.dumps({"code": code, "entrypoint": entrypoint, "arguments": arguments or {}})

    backend = resolve_backend()
    if backend == "docker":
        try:
            return await _run_docker(payload, timeout)
        except SandboxExecutionError as exc:
            # Fail over once per call so a broken docker daemon cannot take skills down.
            logger.warning("docker_sandbox_failed_fallback", extra={"error": str(exc)[:300]})
            return await _run_subprocess(payload, timeout)
    return await _run_subprocess(payload, timeout)
