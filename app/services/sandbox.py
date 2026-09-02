"""Sandboxed execution of dynamically generated Python skills.

Defense-in-depth layers:
1. AST validation rejects prohibited imports/calls before execution.
2. Execution happens in a separate ``python -I`` subprocess with:
   - RLIMIT_AS memory cap, RLIMIT_CPU cap, RLIMIT_NPROC=0 (no forking)
   - wall-clock timeout enforced by the parent
   - stdin closed, output size capped
3. The runner harness whitelists builtins-level import hooks.

Note: on container platforms without privileged Docker (e.g. Clever Cloud
Docker apps) nested containers are unavailable, so process isolation with
rlimits + AST screening is the deployed strategy. gVisor/Docker isolation can
be swapped in on self-managed hosts via SANDBOX settings.
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


async def run_in_sandbox(
    code: str,
    entrypoint: str,
    arguments: dict[str, Any] | None = None,
    *,
    timeout: int | None = None,
    validate: bool = True,
) -> SandboxResult:
    """Validate and execute skill code inside an isolated subprocess."""
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
    harness = _build_harness(settings.SANDBOX_MAX_MEMORY_MB, max(timeout, 1), _ALLOWED_MODULES)
    payload = json.dumps({"code": code, "entrypoint": entrypoint, "arguments": arguments or {}})

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
                )
        except OSError as exc:
            raise SandboxExecutionError(f"Failed to spawn sandbox process: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        max_bytes = settings.SANDBOX_MAX_OUTPUT_BYTES
        stdout = stdout_b[:max_bytes].decode(errors="replace")
        stderr = stderr_b[:max_bytes].decode(errors="replace")

        marker = "__SKILL_RESULT__"
        if marker in stdout:
            printed, _, tail = stdout.rpartition(marker)
            try:
                result = json.loads(tail.strip())
            except json.JSONDecodeError:
                result = tail.strip()
            return SandboxResult(
                success=True, result=result, stdout=printed.strip(), stderr=stderr, duration_ms=duration_ms
            )

        error = None
        combined = (stdout + "\n" + stderr).strip()
        try:
            error_line = next(
                line for line in stdout.splitlines() if line.strip().startswith("{") and '"ok"' in line
            )
            error = json.loads(error_line).get("error")
        except (StopIteration, json.JSONDecodeError):
            error = combined[-2000:] if combined else f"Sandbox exited with code {process.returncode}"

        return SandboxResult(
            success=False, stdout=stdout.strip(), stderr=stderr, duration_ms=duration_ms, error=error
        )
