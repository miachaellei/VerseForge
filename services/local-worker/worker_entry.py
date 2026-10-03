"""Frozen executable entry point for the desktop sidecar."""

from story_worker.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
