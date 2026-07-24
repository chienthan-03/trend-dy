import { getTtsMode, type TtsEngine } from "../remix-config";
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

export const createTtsAdapter = async (
  engine: TtsEngine = getTtsMode(),
): Promise<TtsAdapter> => {
  if (engine === "fake") return new FakeTtsAdapter();
  if (engine === "live") {
    const { HttpTtsAdapter } = await import("./http-tts.adapter");
    return new HttpTtsAdapter();
  }
  if (engine === "piper") {
    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    return new PiperTtsAdapter();
  }
  throw new Error(`Unknown TTS engine "${engine}"`);
};
