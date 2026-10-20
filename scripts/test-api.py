"""Run API tests with temporary databases inside the workspace.

Python 3.14 on Windows gives mkdir(mode=0700) a private DACL that excludes
the managed sandbox token. pytest uses that mode for its temp directories.
Use normal inherited workspace permissions for those test-only directories.
No application or security code is patched.
"""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
temporary = root / "runtime" / "api-test-temp"
temporary.mkdir(parents=True, exist_ok=True)
original_mkdir = os.mkdir


def workspace_mkdir(path, mode=0o777, *, dir_fd=None):
    target = Path(path).resolve()
    if os.name == "nt" and mode == 0o700 and (target == temporary or temporary in target.parents):
        mode = 0o777
    return original_mkdir(path, mode, dir_fd=dir_fd)


if __name__ == "__main__":
    os.chdir(root / "apps" / "api")
    sys.path.insert(0, str(Path.cwd()))
    os.mkdir = workspace_mkdir
    import pytest
    raise SystemExit(pytest.main(["--basetemp=" + str(temporary / ("run-" + str(os.getpid()))), "-o", "cache_dir=" + str(temporary / "cache"), *sys.argv[1:]]))
