# FSRS validation against Anki's own engine

These scripts check this app's FSRS maths, calibration and simulator against the Rust backend that ships
inside Anki.app. They produce the results in [docs/fsrs-validation.md](../../docs/fsrs-validation.md).

| Script | Reads | Writes |
|---|---|---|
| `anki_reference.py` | nothing personal (makes a temporary synthetic collection) | `src/lib/fixtures/anki-fsrs-reference.json` (committed; used by `src/lib/fsrs.test.ts`) |
| `anki_export.py` | a **temporary copy** of `data/collection.anki2` | `data/fsrs-validation/anki.json` (git-ignored) |
| `compare.ts` | `data/collection.anki2` (read-only) and the file above | nothing; prints aggregate numbers |

Safety: Anki's backend writes to any collection it opens, so `anki_export.py` opens a copy in a temporary
folder and deletes it afterwards. Neither Anki's own files nor `data/collection.anki2` are opened by Anki.

## Python 3.13

Anki.app bundles its Python modules but not a `python3` binary, and the modules only load in the same
Python version (3.13 for Anki 26.9.3). One way to get it without installing anything system-wide is a
python-build-standalone release, checked against its published SHA-256 checksum:

```sh
gh api repos/astral-sh/python-build-standalone/releases/latest \
  --jq '.assets[] | select(.name | test("cpython-3\\.13.*aarch64-apple-darwin-install_only\\.tar\\.gz$")) | .browser_download_url, .digest'
# download that file into an empty folder, check it with `shasum -a 256`, then `tar xzf` it
```

Run the Python scripts with `-I` (isolated mode), so only Anki's bundled modules are loaded:

```sh
<folder>/python/bin/python3 -I scripts/fsrs-validation/anki_export.py
node --import ./scripts/fsrs-validation/ts-resolve.ts scripts/fsrs-validation/compare.ts
```

`ts-resolve.ts` lets Node load `src/lib` modules, whose imports have no `.ts` extension.
