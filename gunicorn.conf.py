"""Gunicorn configuration: multi-core async workers.

Master process supervises (2 x CPU cores) + 1 Uvicorn workers, each running an
independent uvloop event loop. Worker count is capped (MAX_WEB_WORKERS) to
respect database connection budgets and can be pinned via WEB_CONCURRENCY.
"""

import multiprocessing
import os


def _worker_count() -> int:
    explicit = os.getenv("WEB_CONCURRENCY")
    if explicit and explicit.isdigit() and int(explicit) > 0:
        return int(explicit)
    cores = multiprocessing.cpu_count()
    cap = int(os.getenv("MAX_WEB_WORKERS", "9"))
    return max(1, min(2 * cores + 1, cap))


bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"
workers = _worker_count()
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000

timeout = 120                 # worker silent-kill timeout
graceful_timeout = 30
keepalive = 65                # > typical LB idle timeout probes

max_requests = 2000           # recycle workers to bound memory growth
max_requests_jitter = 200

preload_app = False           # each worker owns its event loop, engine and pools
accesslog = None              # request logging handled by app middleware (JSON)
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

proc_name = "clever-ai-team"


def on_starting(server):
    server.log.info("Gunicorn master starting: %s workers across %s cores", workers, multiprocessing.cpu_count())


def post_fork(server, worker):
    server.log.info("Worker spawned (pid: %s)", worker.pid)
