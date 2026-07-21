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

  videoKey(remakeId: string): string {
    return `remix/${remakeId}/source-video.mp4`;
  }

  dubAudioKey(remakeId: string): string {
    return `remix/${remakeId}/dub-audio.mp3`;
  }

  renderKey(remakeId: string): string {
    return `remix/${remakeId}/render.mp4`;
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

  async putVideo(
    remakeId: string,
    video: Buffer,
    contentType: string = "video/mp4",
  ): Promise<string> {
    const key = this.videoKey(remakeId);
    await this.storage.putObject(key, video, contentType);
    return key;
  }

  async getVideo(key: string): Promise<Buffer> {
    return this.storage.getObject(key);
  }

  async deleteVideo(key: string): Promise<void> {
    await this.storage.deleteObject(key);
  }

  async putDub(
    remakeId: string,
    audio: Buffer,
    contentType: "audio/mpeg" = "audio/mpeg",
  ): Promise<string> {
    const key = this.dubAudioKey(remakeId);
    await this.storage.putObject(key, audio, contentType);
    return key;
  }

  async getDub(key: string): Promise<Buffer> {
    return this.storage.getObject(key);
  }

  async deleteDub(key: string): Promise<void> {
    await this.storage.deleteObject(key);
  }

  async putRender(
    remakeId: string,
    video: Buffer,
    contentType: string = "video/mp4",
  ): Promise<string> {
    const key = this.renderKey(remakeId);
    await this.storage.putObject(key, video, contentType);
    return key;
  }

  async getRender(key: string): Promise<Buffer> {
    return this.storage.getObject(key);
  }

  async headRender(key: string): Promise<{ contentLength: number; contentType?: string }> {
    return this.storage.headObject(key);
  }

  async getRenderStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<{
    body: import("node:stream").Readable;
    contentLength: number;
    contentRange?: string;
    contentType?: string;
  }> {
    return this.storage.getObjectStream(key, range);
  }

  async deleteRender(key: string): Promise<void> {
    await this.storage.deleteObject(key);
  }
}
