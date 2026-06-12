from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request


VERSION = os.environ.get("LIGHTFM_VERSION", "1.17")


def safe_extract(archive: tarfile.TarFile, target: pathlib.Path) -> None:
    target = target.resolve()
    for member in archive.getmembers():
        destination = (target / member.name).resolve()
        if target not in destination.parents and destination != target:
            raise RuntimeError(f"Unsafe archive member: {member.name}")
    archive.extractall(target)


def main() -> int:
    build_dir = pathlib.Path(tempfile.mkdtemp(prefix="lightfm-build-"))
    try:
        metadata_url = f"https://pypi.org/pypi/lightfm/{VERSION}/json"
        with urllib.request.urlopen(metadata_url, timeout=30) as response:
            metadata = json.load(response)

        sdist = next(item for item in metadata["urls"] if item["packagetype"] == "sdist")
        archive_path = build_dir / f"lightfm-{VERSION}.tar.gz"
        urllib.request.urlretrieve(sdist["url"], archive_path)

        with tarfile.open(archive_path) as archive:
            safe_extract(archive, build_dir)

        package_dir = build_dir / f"lightfm-{VERSION}"
        setup_path = package_dir / "setup.py"
        setup_text = setup_path.read_text(encoding="utf-8")
        broken_line = "__builtins__.__LIGHTFM_SETUP__ = True"
        fixed_line = "import builtins\nbuiltins.__LIGHTFM_SETUP__ = True"
        if broken_line not in setup_text:
            raise RuntimeError("LightFM setup.py patch target was not found.")
        setup_path.write_text(setup_text.replace(broken_line, fixed_line), encoding="utf-8")

        env = os.environ.copy()
        env.setdefault("LIGHTFM_NO_CFLAGS", "1")
        subprocess.check_call(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--no-build-isolation",
                str(package_dir),
            ],
            env=env,
        )
    finally:
        shutil.rmtree(build_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
