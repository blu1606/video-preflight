# Data layout

Imported on 2026-10-31 from `video-lab-data-261031.zip`.

The archive contains 586 files: 585 payload files (195,581,776 bytes) and `MANIFEST.txt` (51,072 bytes). ZIP SHA256: `91b459110d98be8ad5e5b73d3bffb8abcb1de050559451071cdcee874f3ecdcc`.

## Git scope

Git includes 554 payload files (24,880,537 bytes). The 30 videos and `data/db/db.json` stay local and ignored: 31 files (170,701,239 bytes). Every tracked payload file is smaller than 5 MiB. The manifest records `tracked` or `local-only` for each payload. A fresh clone does not contain the local-only files; obtain the source archive and use the manifest mapping if those files are needed.

The ignore rules cover the video directory and this large database snapshot. Git does not enforce a dynamic size limit; check new data files against the 5 MiB threshold before adding them.

## Repository paths

| Archive original prefix | Repository location | Contents |
| --- | --- | --- |
| `data/` | `data/videos/` | 30 video files, local-only |
| `demo/fixtures/` | `data/fixtures/` | Benchmark, market, policy, calibration and seed fixtures; supporting scripts |
| `demo/db/` | `data/db/` | Supporting files; `db.json` is local-only |
| `demo/output/` | `data/output/` | Cached extraction and analysis outputs |
| `demo/web/public/skus/` | `data/assets/skus/` | SKU images |
| `demo/web/src/lib/fixtures/` | `data/fixtures/ui/` | UI fixture data |

Locate files using these repository paths; no checkout of the original project is needed. `data/import-manifest.tsv` maps every payload archive filename and original relative path to its repository path, SHA256 and tracking status. `data/source-manifest.txt` preserves the original archive manifest unchanged.

Payload bytes, including scripts, documentation and embedded legacy paths, are preserved exactly. Embedded paths describe the original environment; they have not been rewritten or verified as runnable in this repository. Importing scripts does not execute them. Future application code must resolve data through the repository layout above.

## Validation and provenance

- All 585 payload files have unique, safe destination paths and matching SHA256 hashes after extraction.
- All 284 JSON files and the JSONL file parse successfully.
- Largest file: `data/videos/upl-86525bd9.mp4`, 16,248,823 bytes; no imported file exceeds 100 MiB.
- Text scan and JSON field review found no actual credentials or private account data. Product lookup tokens and public image URLs are retained as source data.
- The archived `data/fixtures/market/.gitignore` contains `raw/`. The imported raw files are deliberately tracked for this snapshot; future raw files still match that ignore rule.
- Original source and usage notes remain in [market-data-provenance.md](market-data-provenance.md). Synthetic shop/SKU data and unverified reported video outcomes retain their existing labels. This import does not independently validate source claims or grant rights to third-party data.
