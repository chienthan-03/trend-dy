# Remix TTS Audio Mode UI Smoke Checklist

Manual verification for per-remake `replace` vs `mix` TTS audio mode in Remake Studio.

**Plan:** [2026-07-29-remix-tts-audio-mode-ui.md](./2026-07-29-remix-tts-audio-mode-ui.md)

---

## Smoke test steps

| Step | Action | Expect |
|------|--------|--------|
| 1 | UI → Giữ nhạc nền (mix) | `ttsAudioMode=mix`; dub cleared; phase idle |
| 2 | Classify Review/Giữ gốc | Roles stick |
| 3 | Tạo audio VI | TTS skips source when mix |
| 4 | Render | Mix path; music under VI on Review windows |
