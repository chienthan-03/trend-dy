import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSegmentsFromPlainText,
  detectAudioUploadFormat,
  estimateSttCostUsd,
  mapWhisperResponseToTranscript,
  transcribeAudio,
} from "./stt";

const WHISPER_FIXTURE = {
  task: "transcribe",
  language: "chinese",
  duration: 12.5,
  text: " 你好世界 这是测试 ",
  segments: [
    { id: 0, seek: 0, start: 0.0, end: 5.2, text: " 你好世界" },
    { id: 1, seek: 520, start: 5.2, end: 12.5, text: " 这是测试" },
  ],
};

describe("estimateSttCostUsd", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("charges whisper-1 rate per minute", () => {
    process.env.REMIX_STT_MODEL = "whisper-1";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(estimateSttCostUsd(60)).toBeCloseTo(0.006);
    expect(estimateSttCostUsd(120)).toBeCloseTo(0.012);
  });

  it("charges turbo rate per minute", () => {
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3-turbo";
    delete process.env.REMIX_STT_COST_PER_MINUTE_USD;
    expect(estimateSttCostUsd(60)).toBeCloseTo(0.04 / 60);
  });
});

describe("buildSegmentsFromPlainText", () => {
  it("splits plain text into timed segments", () => {
    const segments = buildSegmentsFromPlainText("第一句。第二句！", 10);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.text).toBe("第一句。");
    expect(segments[1]!.endSec).toBe(10);
  });

  it("splits space-separated Chinese without 。！？ into multiple cues", () => {
    const text =
      "女人患有严重的关节炎 在旁人眼里她就是个奇形怪物 哥哥因为经商失败 偷偷把母亲留给她的房子拿去了抵押";
    const segments = buildSegmentsFromPlainText(text, 40);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]!.startSec).toBe(0);
    expect(segments.at(-1)!.endSec).toBe(40);
    expect(segments.every((segment) => segment.text.length > 0)).toBe(true);
  });
});

describe("mapWhisperResponseToTranscript", () => {
  it("maps Whisper verbose_json segments to RemixTranscriptV1", () => {
    const transcript = mapWhisperResponseToTranscript(
      WHISPER_FIXTURE,
      "whisper-1",
      "openai",
      "zh",
    );

    expect(transcript).toEqual({
      version: 1,
      language: "chinese",
      durationSec: 12.5,
      segments: [
        { startSec: 0, endSec: 5.2, text: "你好世界" },
        { startSec: 5.2, endSec: 12.5, text: "这是测试" },
      ],
      fullText: "你好世界 这是测试",
      provider: "openai",
      model: "whisper-1",
    });
  });

  it("re-splits a single mega segment that spans the whole clip", () => {
    const megaText =
      "女人患有严重的关节炎 在旁人眼里她就是个奇形怪物 哥哥因为经商失败 偷偷把母亲留给她的房子拿去了抵押 无处可去的她只能借住在姨妈家里";
    const transcript = mapWhisperResponseToTranscript(
      {
        language: "chinese",
        duration: 120,
        text: megaText,
        segments: [{ start: 0, end: 120, text: megaText }],
      },
      "openai/whisper-large-v3-turbo",
      "gateway",
    );

    expect(transcript.segments.length).toBeGreaterThan(1);
    expect(transcript.segments[0]!.startSec).toBe(0);
    expect(transcript.segments.at(-1)!.endSec).toBe(120);
  });
});

describe("detectAudioUploadFormat", () => {
  it("detects mp3 by ID3 header", () => {
    const format = detectAudioUploadFormat(Buffer.from("ID3\x04"));
    expect(format.fileName).toBe("audio.mp3");
  });

  it("defaults to wav for RIFF", () => {
    const format = detectAudioUploadFormat(Buffer.from("RIFF....WAVE"));
    expect(format.fileName).toBe("audio.wav");
  });
});

describe("transcribeAudio", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("returns valid RemixTranscriptV1 in fake mode", async () => {
    process.env.REMIX_STT_MODE = "fake";
    process.env.REMIX_FAKE_DURATION_SEC = "60";
    process.env.REMIX_STT_MODEL = "openai/whisper-large-v3-turbo";

    const result = await transcribeAudio(Buffer.from("test-wav-data"));

    expect(result.transcript.version).toBe(1);
    expect(result.transcript.provider).toBe("fake");
    expect(result.transcript.model).toBe("openai/whisper-large-v3-turbo");
    expect(result.transcript.language).toBe("zh");
    expect(result.transcript.durationSec).toBe(60);
    expect(result.transcript.segments.length).toBeGreaterThanOrEqual(8);
    expect(result.transcript.segments.length).toBeLessThanOrEqual(12);
    expect(result.transcript.fullText).toBe(
      result.transcript.segments.map((segment) => segment.text).join(""),
    );
    expect(result.transcript.segments[0]!.startSec).toBe(0);
    expect(result.transcript.segments.at(-1)!.endSec).toBe(60);
    expect(result.costUsd).toBeCloseTo(0.04 / 60);
  });

  it("defaults to fake mode when REMIX_STT_MODE is unset", async () => {
    delete process.env.REMIX_STT_MODE;

    const result = await transcribeAudio(Buffer.from("unset-mode-wav"));

    expect(result.transcript.provider).toBe("fake");
  });

  it("is deterministic in fake mode for the same buffer", async () => {
    process.env.REMIX_STT_MODE = "fake";

    const wav = Buffer.from("same-buffer");
    const first = await transcribeAudio(wav);
    const second = await transcribeAudio(wav);

    expect(first).toEqual(second);
  });

  it("maps Whisper verbose_json in live mode", async () => {
    process.env.REMIX_STT_MODE = "live";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.REMIX_STT_MODEL = "whisper-1";
    delete process.env.AI_GATEWAY_URL;
    delete process.env.REMIX_STT_API_URL;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(WHISPER_FIXTURE), { status: 200 }),
    );

    const result = await transcribeAudio(Buffer.from("live-wav"), {
      languageHint: "zh",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const form = fetchCall?.[1]?.body as FormData;
    const file = form?.get("file") as File | null;

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(file?.name).toBe("audio.wav");
    expect(result.transcript.version).toBe(1);
    expect(result.transcript.provider).toBe("openai");
    expect(result.transcript.segments).toHaveLength(2);
    expect(result.transcript.segments[0]!.text).toBe("你好世界");
    expect(result.costUsd).toBeCloseTo(0.00125);
  });

  it("requests verbose_json by default when AI gateway is configured", async () => {
    process.env.REMIX_STT_MODE = "live";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    delete process.env.REMIX_STT_API_URL;
    delete process.env.REMIX_STT_RESPONSE_FORMAT;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(WHISPER_FIXTURE), { status: 200 }),
    );

    const result = await transcribeAudio(Buffer.from([0xff, 0xfb, 0x90, 0x00]), {
      languageHint: "zh",
    });

    const fetchCall = fetchMock.mock.calls[0];
    const form = fetchCall?.[1]?.body as FormData;
    expect(form?.get("response_format")).toBe("verbose_json");
    expect(result.transcript.provider).toBe("gateway");
    expect(result.transcript.segments).toHaveLength(2);
  });

  it("falls back to json when verbose_json is rejected", async () => {
    process.env.REMIX_STT_MODE = "live";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GATEWAY_URL = "https://openrouter.ai/api/v1";
    delete process.env.REMIX_STT_API_URL;
    delete process.env.REMIX_STT_RESPONSE_FORMAT;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("verbose_json unsupported", { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "你好。世界。" }), { status: 200 }),
      );

    const result = await transcribeAudio(Buffer.from([0xff, 0xfb, 0x90, 0x00]), {
      languageHint: "zh",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondForm = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(secondForm?.get("response_format")).toBe("json");
    expect(result.transcript.segments.length).toBeGreaterThan(0);
    expect(result.transcript.fullText).toContain("你好");
  });

  it("compresses oversized legacy WAV before live STT", async () => {
    process.env.REMIX_STT_MODE = "live";
    process.env.OPENAI_API_KEY = "test-key";

    const largeWav = Buffer.alloc(30 * 1024 * 1024, 0);
    largeWav.write("RIFF", 0);
    largeWav.write("WAVE", 8);

    const compressed = Buffer.from([0xff, 0xfb, 0x90, 0x00]);

    const audioUtil = await import("../modules/remix/remix-audio.util");
    const compressMock = vi
      .spyOn(audioUtil, "compressAudioBufferForStt")
      .mockResolvedValue(compressed);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(WHISPER_FIXTURE), { status: 200 }),
    );

    await transcribeAudio(largeWav, { languageHint: "zh" });

    expect(compressMock).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
