# -*- coding: utf-8 -*-
"""Restore ShopRadar files from Cursor agent transcript (Write + StrReplace replay)."""
import json
import os
import re
from pathlib import Path

TRANSCRIPT = Path(
    r"C:\Users\LENOVO\.cursor\projects\d-SOFT-java-ShopRadar"
    r"\agent-transcripts\d555cd1a-5ebf-478f-a1d8-ba4f16c91478"
    r"\d555cd1a-5ebf-478f-a1d8-ba4f16c91478.jsonl"
)
ROOT = Path(r"d:\SOFT\java\ShopRadar")
SKIP_REL = {
    "_fix_btn.py",
    "_fix_popup.py",
    os.path.join("shopradar-server", "test-mvmt.js"),
}


def to_rel(path: str) -> str | None:
    p = path.replace("\\", "/")
    marker = "/ShopRadar/"
    i = p.lower().find(marker.lower())
    if i < 0:
        return None
    rel = p[i + len(marker) :]
    if "node_modules" in rel:
        return None
    return rel.replace("/", os.sep)


def norm(text: str) -> str:
    return text.replace("\r\n", "\n")


def apply_replace(content: str, old: str, new: str) -> tuple[str, bool]:
    if old in content:
        return content.replace(old, new, 1), True
    ncontent = norm(content)
    nold = norm(old)
    nnew = norm(new)
    if nold in ncontent:
        return ncontent.replace(nold, nnew, 1), True
    return content, False


def main():
    files: dict[str, str] = {}
    failed: list[tuple[str, int, str]] = []

    with TRANSCRIPT.open("r", encoding="utf-8", errors="replace") as f:
        for lineno, line in enumerate(f, 1):
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            content = o.get("message", {}).get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if block.get("type") != "tool_use":
                    continue
                name = block.get("name")
                inp = block.get("input", {})
                rel = to_rel(inp.get("path", ""))
                if not rel or rel in SKIP_REL:
                    continue
                if name == "Write":
                    files[rel] = inp.get("contents", "")
                elif name == "StrReplace":
                    old = inp.get("old_string", "")
                    new = inp.get("new_string", "")
                    if rel not in files:
                        failed.append((rel, lineno, "no prior Write: " + old[:60]))
                        continue
                    updated, ok = apply_replace(files[rel], old, new)
                    if ok:
                        files[rel] = updated
                    else:
                        failed.append((rel, lineno, old[:80]))

    restored = 0
    for rel, text in files.items():
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(norm(text), encoding="utf-8", newline="\n")
        restored += 1
        print("restored", rel, len(text))

    fail_log = ROOT / "scripts" / "restore-failed-patches.log"
    fail_log.write_text(
        "\n".join(f"{r}:{ln}:{s}" for r, ln, s in failed),
        encoding="utf-8",
    )
    print("done:", restored, "files;", len(failed), "failed patches ->", fail_log)


if __name__ == "__main__":
    main()
