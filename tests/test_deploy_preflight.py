"""Pure deployment configuration regressions; no Docker or network actions."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("preflight", Path(__file__).resolve().parents[1] / "scripts/deploy-preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class DeploymentPreflight(unittest.TestCase):
    def configuration(self):
        return {"DOMAIN": "updates.operator.cn", "PUBLIC_SITE_URL": "https://updates.operator.cn", "ACME_EMAIL": "ops@operator.cn", "POSTGRES_PASSWORD": "0123456789abcdef" * 4, "STATION_SIGNING_KEY": "fedcba9876543210" * 4}

    def failures(self, **overrides):
        return [x["name"] for x in preflight.evaluate({**self.configuration(), **overrides}) if x["status"] != "passed"]

    def test_valid_and_mismatching_site(self):
        self.assertEqual(self.failures(), [])
        self.assertIn("PUBLIC_SITE_URL", self.failures(PUBLIC_SITE_URL="https://other.operator.cn"))
        self.assertIn("DOMAIN", self.failures(DOMAIN="example.com"))

    def test_unique_secrets_and_safe_database_names(self):
        self.assertIn("independent_secrets", self.failures(STATION_SIGNING_KEY=self.configuration()["POSTGRES_PASSWORD"]))
        self.assertIn("POSTGRES_PASSWORD", self.failures(POSTGRES_PASSWORD="a" * 64))
        self.assertIn("POSTGRES_USER", self.failures(POSTGRES_USER="name:password@host"))

    def test_bootstrap_lifecycle_and_native_scope(self):
        self.assertIn("bootstrap_password_removed", self.failures(ADMIN_INITIAL_PASSWORD="not-a-production-password"))
        self.assertIn("MINIAPP_REFERER_PREFIXES[0]", self.failures(MINIAPP_REFERER_PREFIXES="https://mini.operator.cn/"))
        self.assertEqual(self.failures(MINIAPP_REFERER_PREFIXES="https://mini.operator.cn/app-id/"), [])
        checks = preflight.evaluate(self.configuration(), bootstrap=True)
        self.assertEqual({x["name"] for x in checks if x["status"] == "failed"}, {"ADMIN_INITIAL_EMAIL", "ADMIN_INITIAL_PASSWORD"})

    def test_cli_rejects_shell_overrides_without_printing_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "production.env"
            values = self.configuration()
            path.write_text("\n".join(f"{key}={value}" for key, value in values.items()), encoding="utf-8")
            path.chmod(0o600)
            env = {key: value for key, value in os.environ.items() if key not in values and not key.startswith("COMPOSE_")}
            env["POSTGRES_PASSWORD"] = "conflicting-shell-value-do-not-log"
            result = subprocess.run([sys.executable, str(Path(preflight.__file__)), "--env-file", str(path)], env=env, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 1)
            report = json.loads(result.stdout)
            self.assertIn("shell_environment_overrides", {item["name"] for item in report["checks"] if item["status"] == "failed"})
            for secret in [values["POSTGRES_PASSWORD"], values["STATION_SIGNING_KEY"], env["POSTGRES_PASSWORD"]]:
                self.assertNotIn(secret, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
