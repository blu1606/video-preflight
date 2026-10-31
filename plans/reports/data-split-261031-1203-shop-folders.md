# Data split into per-shop folders (261031)

## Outcome
- `data/SHOP001/` through `data/SHOP009/` now hold each shop's videos, following `db.json videos[].shopId`. That is 27 seed videos plus 3 uploads: SHOP001 has 5 files, SHOP002 has 4, and every other shop has 3.
- In both `videos[]` and `benchmarkVideos[]`, `local_file` is now the path relative to `data/` (for example `SHOP001/vn-beauty-467796.mp4`). All 30 video rows resolve to an existing file.
- One file is not referenced by any db row and was left at the data root: `data/vn-womenswear-048084.mp4`. It is a benchmark CSV row with no shop. Regenerating the db with `db/build_db.py` would add it to `benchmarkVideos` with the bare `local_file`. That row was already missing from the current db.json before this change.
- Backup: `db/db.backup-261031.json`. Compared with the backup, the only lines that differ in db.json are the 57 `local_file` lines. Line endings are still LF and the file was written atomically.

## Code
- New file `sources/media.py` holds the shared path helpers: `DATA_DIR`, `VIDEO_EXT`, `shop_dir()` (rejects ids that are not a single path segment), `relative()`, `iter_videos()` (searches the root and the shop folders) and `find_video()`.
- `api.py`: uploads are saved under `data/<shopId>/` with a shop-relative `local_file`. An upload with no shop is saved at the root. `/media` works unchanged.
- `sources/benchmark.py`: `local_videos()` also searches the shop folders, and `--download` saves into `data/<shop>/`.
- `sources/providers.py`: `_video_path` falls back to finding the file by name under `data/`. The cached `video_file` paths in `output/features` already pointed to an old checkout, so the platform-fit and pacing features were already MISSING for those videos. This fallback fixes that.
- `db/build_db.py`: writes `local_file` as the path relative to `data/`. A dry run gives the same values as the current db.json.
- `fixtures/shopee_seed/build_seed.py`: reads video duration from `data/<shop>/<file>`, falling back to `data/<file>`.
- `.gitignore`: `data/*.mp4` becomes `data/**/*.mp4`.
- `tests/test_media_paths.py`: 10 new tests.

## Verification
- `uv run python -m unittest discover -s tests -t .` ran 342 tests, all OK.
- `uv run python -c "import api, main"` works.

## Notes for web / controller
- `web/src/components/result/video-stage.jsx` builds `/media/${encodeURIComponent(local_file)}`, which encodes `/` as `%2F`. Starlette decodes the path, and a test shows `/media/SHOP001%2F...` is served (206). It works as is. Using `encodeURI` or encoding each segment would be cleaner if web wants to change it.
- Old `analyses[].trace` entries still contain bare `local_file` names. They are historical records and were not rewritten.
- uvicorn (:8100) needs a restart so the upload path change takes effect.
