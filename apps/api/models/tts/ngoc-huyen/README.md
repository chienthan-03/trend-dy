# Ngọc Huyền (mới) — Piper TTS voice

Place the Piper model pair in this directory:

- `Ngọc Huyền (mới).onnx`
- `Ngọc Huyền (mới).onnx.json`

These files come from the **NGHI-TTS** ecosystem. Before using them in production, confirm you have the right to redistribute and run the weights under NGHI-TTS licensing terms.

## Setup

1. Obtain the `.onnx` and `.onnx.json` files from your licensed NGHI-TTS source.
2. Copy both files into this folder (exact filenames above).
3. Install the [Piper CLI](https://github.com/rhasspy/piper) and set `REMIX_PIPER_BIN` if it is not on `PATH`.
4. Set `REMIX_TTS_MODE=piper` (or `local`) in `.env`.

There is **no runtime download** — the worker reads models from local paths only (`REMIX_PIPER_MODEL_DIR` overrides the default dir).

## Override paths

```env
REMIX_PIPER_BIN=piper
REMIX_PIPER_MODEL_DIR=/absolute/path/to/ngoc-huyen
REMIX_PIPER_MODEL_STEM=Ngọc Huyền (mới)
```
