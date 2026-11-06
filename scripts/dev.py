"""Portable supervisor: terminate both process groups when either server exits."""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


def available_port(start: int, excluded: set[int] | None = None) -> int:
    for port in range(start, min(start + 100, 65536)):
        if port in (excluded or set()):
            continue
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"No available localhost port near {start}")


def main():
    root = Path(__file__).resolve().parents[1]
    if "--notebooks" in sys.argv:
        os.environ["EVIDENCELAB_NOTEBOOK_EXECUTION"] = "1"
    api_port = str(available_port(int(os.environ.get("EVIDENCELAB_API_PORT", "8000"))))
    web_port = str(available_port(int(os.environ.get("EVIDENCELAB_WEB_PORT", "5173")), {int(api_port)}))
    os.environ["EVIDENCELAB_API_PORT"] = api_port
    os.environ["EVIDENCELAB_WEB_PORT"] = web_port
    print(f"EvidenceLab dashboard: http://127.0.0.1:{web_port}", flush=True)
    print(f"EvidenceLab API: http://127.0.0.1:{api_port}/docs", flush=True)
    children = []
    try:
        for command in (
            [
                sys.executable,
                "-m",
                "uvicorn",
                "evidencelab.api:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                api_port,
            ],
            ["npm", "--prefix", "web", "run", "dev", "--", "--host", "127.0.0.1", "--port", web_port],
        ):
            children.append(subprocess.Popen(command, cwd=root, start_new_session=True))
        while all(child.poll() is None for child in children):
            time.sleep(0.3)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)


if __name__ == "__main__":
    main()
