"""Portable supervisor: terminate both process groups when either server exits."""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    api_port = os.environ.get("EVIDENCELAB_API_PORT", "8000")
    web_port = os.environ.get("EVIDENCELAB_WEB_PORT", "5173")
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
