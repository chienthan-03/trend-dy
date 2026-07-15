import { Inject, Injectable } from "@nestjs/common";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../import/storage/object-storage";

@Injectable()
export class RemixStorageService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  audioKey(remakeId: string, ext: "mp3" | "wav" = "mp3"): string {
    return `remix/${remakeId}/source-audio.${ext}`;
  }

  async putAudio(
    remakeId: string,
    audio: Buffer,
    contentType: "audio/mpeg" | "audio/wav" = "audio/mpeg",
  ): Promise<string> {
    const ext = contentType === "audio/wav" ? "wav" : "mp3";
    const key = this.audioKey(remakeId, ext);
    await this.storage.putObject(key, audio, contentType);
    return key;
  }

  async getAudio(key: string): Promise<Buffer> {
    return this.storage.getObject(key);
  }

  async deleteAudio(key: string): Promise<void> {
    await this.storage.deleteObject(key);
  }
}
