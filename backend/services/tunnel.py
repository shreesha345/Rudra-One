"""
Cloudflare Tunnel manager — replaces ngrok.

Quick tunnel mode (default, no account/token/key needed):
    Auto-downloads the cloudflared binary, starts a quick tunnel, and
    parses the ephemeral trycloudflare.com URL from stdout.

Named tunnel mode (optional):
    Set TUNNEL_TOKEN in .env to use a named tunnel from your Cloudflare
    dashboard.
"""
from __future__ import annotations

import logging
import os
import platform
import re
import subprocess
import time
from pathlib import Path
from typing import Optional

import requests

from backend import config

logger = logging.getLogger(__name__)

_process: Optional[subprocess.Popen] = None
_public_domain: Optional[str] = None

# Cache the binary here so we don't re-download every run
_CACHE_DIR = Path(os.path.expanduser("~/.cache/rudraone"))
_BINARY_NAME = "cloudflared.exe" if platform.system() == "Windows" else "cloudflared"


def _get_binary_path() -> Path:
    """Return the path where we cache the cloudflared binary."""
    return _CACHE_DIR / _BINARY_NAME


def _download_binary() -> Optional[Path]:
    """Download the cloudflared binary for the current platform."""
    system = platform.system()
    machine = platform.machine().lower()

    if system == "Windows" and machine in ("amd64", "x86_64", "x64"):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    elif system == "Linux" and machine in ("amd64", "x86_64"):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    elif system == "Darwin" and machine in ("arm64", "aarch64"):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
    elif system == "Darwin" and machine in ("amd64", "x86_64"):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64"
    else:
        logger.error("Unsupported platform: %s %s", system, machine)
        return None

    binary = _get_binary_path()
    binary.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Downloading cloudflared for %s %s ...", system, machine)
    try:
        resp = requests.get(url, timeout=120, stream=True)
        resp.raise_for_status()
        with open(binary, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        os.chmod(binary, 0o755)
        logger.info("Downloaded cloudflared → %s", binary)
        return binary
    except Exception as e:
        logger.error("Failed to download cloudflared: %s", e)
        return None


def _find_cloudflared() -> Optional[str]:
    """
    Return the cloudflared executable path.
    Checks: PATH → cached binary → auto-download.
    """
    # 1. Already in PATH?
    from shutil import which
    path = which(_BINARY_NAME)
    if path:
        return path

    # 2. Cached?
    cached = _get_binary_path()
    if cached.exists():
        return str(cached)

    # 3. Download
    downloaded = _download_binary()
    if downloaded and downloaded.exists():
        return str(downloaded)

    return None


def start_tunnel(port: int) -> Optional[str]:
    """
    Start a cloudflared tunnel for *port* and return the public hostname
    (without protocol).  Returns None on failure.
    """
    global _process, _public_domain

    # If a pre-known URL is provided, just use it
    if config.TUNNEL_URL:
        _public_domain = config.TUNNEL_URL
        logger.info("Cloudflare Tunnel: using pre-configured URL %s", _public_domain)
        return _public_domain

    # Find or download the binary
    binary = _find_cloudflared()
    if not binary:
        logger.error(
            "Could not find or download cloudflared. "
            "Install manually from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
        )
        return None

    try:
        if config.TUNNEL_TOKEN:
            # Named tunnel with token
            logger.info("Starting Cloudflare named tunnel on port %s ...", port)
            _process = subprocess.Popen(
                [
                    binary, "tunnel",
                    "--url", f"http://localhost:{port}",
                    "run",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env={**os.environ, "TUNNEL_TOKEN": config.TUNNEL_TOKEN},
            )
        else:
            # Quick tunnel (no token / key / account needed — free)
            logger.info("Starting Cloudflare quick tunnel on port %s ...", port)
            _process = subprocess.Popen(
                [
                    binary, "tunnel",
                    "--url", f"http://localhost:{port}",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
    except FileNotFoundError:
        logger.error("cloudflared binary not found after download attempt.")
        return None
    except Exception as e:
        logger.error("Failed to start cloudflared: %s", e)
        return None

    # Parse the public URL from stdout (quick tunnel prints it)
    _public_domain = _wait_for_url(timeout=30)
    if _public_domain:
        logger.info("Cloudflare Tunnel URL: %s", _public_domain)
    else:
        logger.warning("Could not determine Cloudflare Tunnel URL automatically.")
    return _public_domain


def _wait_for_url(timeout: int = 60) -> Optional[str]:
    """Read cloudflared stdout until we find the trycloudflare URL."""
    if _process is None or _process.stdout is None:
        return None

    deadline = time.time() + timeout
    url_re = re.compile(r"https://([a-z0-9-]+\.trycloudflare\.com)")
    while time.time() < deadline:
        line = _process.stdout.readline()
        if line == "":
            logger.warning("cloudflared stdout reached EOF (process may have exited).")
            break
        
        logger.info("cloudflared: %s", line.strip())
        m = url_re.search(line)
        if m:
            domain = m.group(1)
            if domain != "api.trycloudflare.com":
                return domain

        # Also check for configured tunnel hostname
        if "Registered tunnel connection" in line:
            break

    if _process.poll() is not None:
        logger.error("cloudflared process terminated with exit code %s", _process.returncode)
    return None


def get_tunnel_url() -> Optional[str]:
    """Return the current public domain, or None."""
    return _public_domain


def stop_tunnel() -> None:
    """Terminate the cloudflared process."""
    global _process
    if _process:
        try:
            _process.terminate()
            _process.wait(timeout=5)
        except Exception as e:
            logger.error("Error stopping cloudflared: %s", e)
        finally:
            _process = None
