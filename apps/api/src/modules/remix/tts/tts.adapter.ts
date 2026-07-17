import { FakeTtsAdapter } from "./fake-tts.adapter";

export type TtsSynthesizeInput = {
  text: string;
  voiceId: string;
};

export type TtsSynthesizeResult = {
  buffer: Buffer;
  contentType: "audio/mpeg";
  durationSec: number;
  costUsd: number;
};

export interface TtsAdapter {
  synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult>;
}

export const createTtsAdapter = async (): Promise<TtsAdapter> => {
  const mode = process.env.REMIX_TTS_MODE ?? "fake";
  if (mode === "fake") return new FakeTtsAdapter();
  if (mode === "live") {
    const { HttpTtsAdapter } = await import("./http-tts.adapter");
    return new HttpTtsAdapter();
  }
  throw new Error(`Unknown REMIX_TTS_MODE "${mode}"`);
};
