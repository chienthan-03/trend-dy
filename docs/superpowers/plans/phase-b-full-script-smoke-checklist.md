# Phase B Full-Script Smoke Checklist

This checklist provides a set of manual verification steps to ensure the Phase B (Full Script) pipeline is working correctly in a production or staging environment.

## Prerequisites

- [ ] **Infrastructure**: MinIO (or AWS S3) is running and accessible.
- [ ] **Tools**: `ffmpeg` is installed on the system and available in the PATH (check with `ffmpeg -version`).
- [ ] **Environment Variables**:
  - `REMIX_SCRIPT_MODE=full`
  - `REMIX_ALLOW_MEDIA_DOWNLOAD=true`
  - `REMIX_STT_MODE=live` (or `fake` for testing)
  - `REMIX_STT_MODEL=whisper-1`
  - `OPENAI_API_KEY` is set (if using live STT).
  - `DOUYIN_ADAPTER=live` (or `fake` for testing).
  - `DOUYIN_API_TOKEN` is set (if using live adapter).

## Smoke Test Steps

1. **Trigger Remix**:
   - [ ] Go to the Viral Feed.
   - [ ] Paste a real Douyin link and click "Chế biến".
   - [ ] Verify that the remake is created and the status changes to "running".

2. **Monitor Pipeline**:
   - [ ] Open the remake in the Remake Studio.
   - [ ] Observe the pipeline status badge. It should transition through:
     - `pending`
     - `downloading_media` (Đang tải video…)
     - `transcribing` (Đang nhận dạng giọng nói…)
     - `generating` (AI đang viết script…)
     - `ready` (Sẵn sàng)

3. **Verify Data Persistence**:
   - [ ] Check that "Transcript gốc (STT)" panel appears and contains segments with timestamps.
   - [ ] Verify that the generated narration is significantly longer than the caption-only mode (typically > 200 characters for a 1-minute video).
   - [ ] Confirm "Phụ đề (timing từ STT)" hint appears in the editor.

4. **Approve and Export**:
   - [ ] Complete the policy checklist.
   - [ ] Click "Phê duyệt".
   - [ ] Click "Xuất file".
   - [ ] Download and open the ZIP file.
   - [ ] Verify the ZIP contains:
     - `transcript-source.srt`: Timed segments from STT.
     - `transcript-source.txt`: Full text from STT.
     - `script-full.txt`: The complete narration script.
     - `package.srt`: The generated subtitles.

5. **Spot-Check (Manual)**:
   - [ ] Compare the last few segments of `transcript-source.srt` with the end of the original video to ensure full coverage.
   - [ ] Verify that the Vietnamese narration accurately recaps the content described in the transcript.

## Cost & Performance Monitoring

- [ ] Check the `Usage` logs to confirm `remix_stt` jobs have cost recorded.
- [ ] Verify that media files in MinIO/S3 are deleted after the TTL period (default 7 days).
