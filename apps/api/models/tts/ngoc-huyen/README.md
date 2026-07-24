# Ngọc Huyền (mới) — Piper TTS voice

Place the Piper model pair in this directory using **ASCII filenames** (required on Windows — Piper CLI crashes on Unicode paths like `Ngọc Huyền (mới).onnx`):

- `ngoc-huyen.onnx`
- `ngoc-huyen.onnx.json`

Source: NGHI-TTS voice **Ngọc Huyền (mới)**. Rename after download if the files still use the Unicode name. Confirm you have the right to redistribute and run the weights under NGHI-TTS licensing terms.

## Setup

1. Obtain the `.onnx` and `.onnx.json` files from your licensed NGHI-TTS source.
2. Copy both into this folder and rename to `ngoc-huyen.onnx` / `ngoc-huyen.onnx.json`.
3. Install the [Piper CLI](https://github.com/rhasspy/piper/releases) (`piper_windows_amd64.zip` on Windows) and set `REMIX_PIPER_BIN` to the full path of `piper.exe` (must sit next to its DLLs).
4. Set `REMIX_TTS_MODE=piper` (or `local`) in `.env`, then **restart API + worker**.

There is **no runtime download** — the worker reads models from local paths only (`REMIX_PIPER_MODEL_DIR` overrides the default dir).

## Override paths

```env
REMIX_PIPER_BIN=C:/Publish/mock-duyn/tools/piper/piper/piper.exe
REMIX_PIPER_MODEL_DIR=apps/api/models/tts/ngoc-huyen
REMIX_PIPER_MODEL_STEM=ngoc-huyen
```
