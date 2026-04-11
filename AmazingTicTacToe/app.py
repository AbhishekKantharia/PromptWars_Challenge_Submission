"""
Quantum Tic-Tac-Toe - Secure Backend Server
============================================
Serves static frontend files and provides a SAFE, sandboxed terminal
emulator API. Only a strict allowlist of read-only informational commands
are permitted; arbitrary shell execution is explicitly prohibited.

Deployed on Google Cloud Run. Integrates with Google Cloud Logging for
structured audit logs of every terminal interaction.
"""

import http.server
import socketserver
import json
import subprocess
import os
import time
import logging
import re
from collections import defaultdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT = int(os.environ.get("PORT", 8080))

# Rate-limiting: max requests per IP per window (seconds)
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW = 60  # seconds

# ---------------------------------------------------------------------------
# Google Cloud Structured Logging  (graceful fallback if not on GCP)
# ---------------------------------------------------------------------------
try:
    from google.cloud import logging as gcp_logging  # type: ignore
    _gcp_client = gcp_logging.Client()
    _gcp_logger = _gcp_client.logger("quantum-tictactoe")
    GCP_LOGGING_ENABLED = True
except Exception:
    GCP_LOGGING_ENABLED = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
_local_logger = logging.getLogger("quantum-tictactoe")


def log_event(severity: str, message: str, payload: dict = None) -> None:
    """Emit a structured log entry to Cloud Logging (and stdout fallback)."""
    entry = {"message": message, **(payload or {})}
    if GCP_LOGGING_ENABLED:
        try:
            _gcp_logger.log_struct(entry, severity=severity)
        except Exception:
            pass
    _local_logger.info(json.dumps(entry))


# ---------------------------------------------------------------------------
# Allowlisted safe, read-only commands
# ---------------------------------------------------------------------------
ALLOWED_COMMANDS = {
    # System info
    "help": {"args": [], "description": "Show available commands"},
    "date": {"args": [], "description": "Display current date/time"},
    "echo": {"args": ["*"], "description": "Echo text back"},
    "whoami": {"args": [], "description": "Display current user context"},
    "hostname": {"args": [], "description": "Display server hostname"},
    "uname": {"args": ["-a", "-s", "-r", "-m"], "description": "System information"},
    "uptime": {"args": [], "description": "Server uptime"},
    "pwd": {"args": [], "description": "Print working directory"},
    "ls": {"args": ["-l", "-a", "-la", "-lh"], "description": "List files"},
    "dir": {"args": [], "description": "List directory (Windows alias)"},
    "python3": {"args": ["--version"], "description": "Python version"},
    "python": {"args": ["--version"], "description": "Python version"},
    "cat": {"args": ["README.md"], "description": "Read allowed files"},
    "type": {"args": ["README.md"], "description": "Read allowed files (Windows)"},
    "env": {"args": [], "description": "Show safe environment variables"},
    "clear": {"args": [], "description": "Clear terminal"},
    "cls": {"args": [], "description": "Clear terminal (Windows alias)"},
    "ver": {"args": [], "description": "Show OS version"},
    "ping": {"args": ["-c", "1", "google.com"], "description": "Ping google.com"},
    "curl": {"args": ["--version"], "description": "Show curl version"},
    "docker": {"args": ["--version"], "description": "Show Docker version"},
    "git": {"args": ["--version", "log", "--oneline", "-5"], "description": "Git info"},
}

# Dangerous patterns — always blocked even if command looks allowed
BLOCKED_PATTERNS = re.compile(
    r"(;|\||&&|\$\(|`|>|<|rm\s|del\s|shutdown|reboot|kill|curl\s+http|wget\s+http"
    r"|sudo|su\s|chmod|chown|passwd|nc\s|netcat|python\s+-c|eval|exec)",
    re.IGNORECASE,
)

# Environment variables safe to expose
SAFE_ENV_VARS = [
    "PORT", "HOME", "PATH", "LANG", "TERM", "USER", "HOSTNAME",
    "GOOGLE_CLOUD_PROJECT", "K_SERVICE", "K_REVISION",
]


def sanitize_and_validate(raw_command: str) -> tuple[bool, list[str] | None, str | None]:
    """
    Validate a command against the allowlist.
    Returns (is_allowed: bool, resolved_args: list | None, error_msg: str | None).
    """
    raw_command = raw_command.strip()

    if not raw_command:
        return False, None, "No command provided."

    if len(raw_command) > 200:
        return False, None, "Command too long (max 200 chars)."

    # Block dangerous shell metacharacters / injection patterns
    if BLOCKED_PATTERNS.search(raw_command):
        return False, None, "Command contains blocked patterns. Only safe commands are allowed."

    parts = raw_command.split()
    cmd_name = parts[0].lower()
    cmd_args = parts[1:]

    # Special built-ins handled server-side
    if cmd_name in ("clear", "cls", "help", "env"):
        return True, [cmd_name] + cmd_args, None

    if cmd_name not in ALLOWED_COMMANDS:
        return False, None, (
            f"'{cmd_name}' is not in the safe command list. "
            f"Type 'help' to see available commands."
        )

    allowed_args = ALLOWED_COMMANDS[cmd_name]["args"]
    if allowed_args != ["*"]:
        for arg in cmd_args:
            if arg not in allowed_args:
                return False, None, (
                    f"Argument '{arg}' is not allowed for '{cmd_name}'. "
                    f"Allowed: {', '.join(allowed_args) or '(none)'}."
                )

    return True, parts, None


def execute_safe_command(parts: list) -> dict:
    """Execute a pre-validated command and return stdout/stderr."""
    cmd_name = parts[0].lower()

    # --- Server-side built-ins ---
    if cmd_name == "help":
        lines = ["Quantum Tic-Tac-Toe :: Safe Terminal\n", "Available commands:"]
        for name, meta in ALLOWED_COMMANDS.items():
            lines.append(f"  {name:<12} — {meta['description']}")
        return {"stdout": "\n".join(lines), "stderr": "", "returncode": 0}

    if cmd_name in ("clear", "cls"):
        return {"stdout": "__CLEAR__", "stderr": "", "returncode": 0}

    if cmd_name == "env":
        safe_env = {k: os.environ.get(k, "(not set)") for k in SAFE_ENV_VARS}
        out = "\n".join(f"{k}={v}" for k, v in safe_env.items())
        return {"stdout": out, "stderr": "", "returncode": 0}

    # --- Real subprocess execution (allowlisted only) ---
    try:
        result = subprocess.run(
            parts,
            capture_output=True,
            text=True,
            timeout=5,        # hard timeout
            cwd="/app",       # locked working directory
        )
        return {
            "stdout": result.stdout[:4096],   # cap output size
            "stderr": result.stderr[:1024],
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"stdout": "", "stderr": f"Command '{parts[0]}' not found on this system.", "returncode": 127}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out (5s limit).", "returncode": 124}
    except Exception as exc:  # pylint: disable=broad-except
        return {"stdout": "", "stderr": f"Execution error: {exc}", "returncode": 1}


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
_request_log: dict = defaultdict(list)


def is_rate_limited(ip: str) -> bool:
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    _request_log[ip] = [t for t in _request_log[ip] if t > window_start]
    if len(_request_log[ip]) >= RATE_LIMIT_MAX:
        return True
    _request_log[ip].append(now)
    return False


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------
class SecureHandler(http.server.SimpleHTTPRequestHandler):
    """
    Serves static files from the current directory and handles the
    /run_command API endpoint with security controls.
    """

    # CSP allows Google/Firebase CDNs required by the frontend
    _CSP = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' "
            "https://www.googletagmanager.com "
            "https://www.gstatic.com "
            "https://apis.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' "
            "https://*.googleapis.com "
            "https://*.firebaseio.com "
            "wss://*.firebaseio.com "
            "https://www.google-analytics.com; "
        "img-src 'self' data:; "
        "frame-ancestors 'none';"
    )

    def _set_security_headers(self) -> None:
        """Emit hardened HTTP security headers on every response."""
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options",       "nosniff")
        self.send_header("X-Frame-Options",              "DENY")
        self.send_header("Referrer-Policy",              "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy",      self._CSP)
        self.send_header("Strict-Transport-Security",    "max-age=31536000; includeSubDomains")
        self.send_header("Permissions-Policy",           "geolocation=(), microphone=(), camera=()")    

    # Keep old name as alias so callers using _set_cors_headers still work
    _set_cors_headers = _set_security_headers

    def do_OPTIONS(self) -> None:
        """Handle CORS preflight requests safely."""
        self.send_response(204)
        self._set_security_headers()
        self.end_headers()

    def do_GET(self) -> None:
        """Health check endpoint + static file serving."""
        if self.path in ("/health", "/healthz"):
            # Cloud Run / load balancer health check
            body = json.dumps({
                "status":  "ok",
                "service": "quantum-tictactoe",
                "version": "2.0.0",
                "port":    PORT,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type",   "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._set_security_headers()
            self.end_headers()
            self.wfile.write(body)
            return
        # Delegate everything else to SimpleHTTPRequestHandler (serves static files)
        super().do_GET()

    def do_POST(self) -> None:
        """Process terminal command requests with rate limiting and secure validation."""
        if self.path != "/run_command":
            self._send_json(404, {"error": "Not Found"})
            return

        client_ip = self.client_address[0]

        # Rate limit check
        if is_rate_limited(client_ip):
            log_event("WARNING", "Rate limit exceeded", {"ip": client_ip})
            self._send_json(429, {"error": "Too many requests. Please slow down."})
            return

        # Parse body
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 4096:  # reject oversized payloads
                self._send_json(413, {"error": "Payload too large."})
                return
            body = self.rfile.read(length)
            data = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, ValueError):
            self._send_json(400, {"error": "Invalid JSON payload."})
            return

        raw_command = str(data.get("command", ""))

        # Validate
        allowed, parts, err = sanitize_and_validate(raw_command)
        if not allowed:
            log_event("WARNING", "Blocked command", {"ip": client_ip, "cmd": raw_command, "reason": err})
            self._send_json(403, {"stdout": "", "stderr": err, "returncode": 1})
            return

        # Execute
        log_event("INFO", "Executing command", {"ip": client_ip, "cmd": raw_command})
        result = execute_safe_command(parts)
        self._send_json(200, result)

    def _send_json(self, status: int, payload: dict) -> None:
        """Utility to send JSON responses with appropriate headers."""
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # pylint: disable=redefined-builtin
        """Override default logging to be quieter and route via python logging."""
        _local_logger.info("%s - %s", self.client_address[0], format % args)


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    log_event("INFO", f"Quantum Tic-Tac-Toe server starting on port {PORT}")
    with socketserver.TCPServer(("", PORT), SecureHandler) as httpd:
        print(f"✅ Server running at http://0.0.0.0:{PORT}")
        httpd.serve_forever()
