# Piper CLI (local install)

This folder is **gitignored**. Unpack [piper_windows_amd64.zip](https://github.com/rhasspy/piper/releases) here so the layout is:

```text
tools/piper/piper/piper.exe
tools/piper/piper/*.dll
tools/piper/piper/espeak-ng-data/
```

Then set in `.env`:

```env
REMIX_PIPER_BIN=C:/Publish/mock-duyn/tools/piper/piper/piper.exe
REMIX_PIPER_MODEL_STEM=ngoc-huyen
```

Restart the API worker after changing env.
