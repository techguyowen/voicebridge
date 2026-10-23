import { describe, expect, it } from "vitest";
import {
  channelPick,
  createWavHeader,
  downmixChannels,
  float32ToInt16,
  int16ToBase64,
  pcmToWav,
  resample,
} from "../audioCapture";

describe("audioCapture pure helpers", () => {
  it("converts float32 to int16 with proper clamping", () => {
    const input = new Float32Array([0.0, 1.0, -1.0, 1.5, -2.0, 0.5, -0.5]);
    const output = float32ToInt16(input);

    expect(output[0]).toBe(0);
    expect(output[1]).toBe(32767);
    expect(output[2]).toBe(-32768);
    expect(output[3]).toBe(32767);
    expect(output[4]).toBe(-32768);
    expect(output[5]).toBe(Math.round(0.5 * 32767));
    expect(output[6]).toBe(Math.round(-0.5 * 32768));
  });

  it("downmixes two channels by averaging", () => {
    const ch0 = new Float32Array([1.0, 0.5, -0.2]);
    const ch1 = new Float32Array([0.0, -0.5, 0.2]);
    const mixed = downmixChannels(ch0, ch1);

    expect(mixed.length).toBe(3);
    expect(mixed[0]).toBeCloseTo(0.5);
    expect(mixed[1]).toBeCloseTo(0.0);
    expect(mixed[2]).toBeCloseTo(0.0);
  });

  it("picks requested channel correctly", () => {
    const ch0 = new Float32Array([0.1, 0.2]);
    const ch1 = new Float32Array([0.8, 0.9]);

    expect(channelPick([ch0, ch1], 0)).toBe(ch0);
    expect(channelPick([ch0, ch1], 1)).toBe(ch1);
    expect(channelPick([ch0], 1)).toBe(ch0);
  });

  it("resamples correctly across sample rates", () => {
    const input = new Float32Array([0.0, 1.0, 0.0, -1.0]);
    const same = resample(input, 16000, 16000);
    expect(same).toEqual(input);

    const downsampled = resample(input, 32000, 16000);
    expect(downsampled.length).toBe(2);

    const upsampled = resample(input, 16000, 32000);
    expect(upsampled.length).toBe(8);
  });

  it("encodes Int16Array to valid Base64", () => {
    const pcm = new Int16Array([0, 100, -100]);
    const b64 = int16ToBase64(pcm);
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);

    const decodedBuf = Buffer.from(b64, "base64");
    const decodedInt16 = new Int16Array(
      decodedBuf.buffer,
      decodedBuf.byteOffset,
      decodedBuf.byteLength / 2
    );
    expect(decodedInt16[0]).toBe(0);
    expect(decodedInt16[1]).toBe(100);
    expect(decodedInt16[2]).toBe(-100);
  });

  it("generates a valid 44-byte RIFF WAV header and WAV file", () => {
    const header = createWavHeader(8, 16000, 1, 16);
    expect(header.length).toBe(44);

    const pcm = new Int16Array([10, 20, 30, 40]);
    const wav = pcmToWav(pcm, 16000);

    expect(wav.length).toBe(44 + 8);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // 1 channel
    expect(view.getUint32(24, true)).toBe(16000); // 16kHz
    expect(view.getUint16(34, true)).toBe(16); // 16 bits
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe("data");
    expect(view.getUint32(40, true)).toBe(8); // 4 samples * 2 bytes
  });
});
