import type { AudioSource } from "../types";

export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return output;
}

export function downmixChannels(ch0: Float32Array, ch1: Float32Array): Float32Array {
  const len = Math.min(ch0.length, ch1.length);
  const mixed = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mixed[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mixed;
}

export function channelPick(channels: Float32Array[], channelIndex: 0 | 1): Float32Array {
  if (channelIndex < channels.length && channels[channelIndex]) {
    return channels[channelIndex];
  }
  return channels[0] ?? new Float32Array(0);
}

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return new Float32Array(input);
  }
  const ratio = fromRate / toRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const index = Math.floor(srcPos);
    const frac = srcPos - index;
    const nextIndex = Math.min(index + 1, input.length - 1);
    output[i] = input[index] * (1 - frac) + input[nextIndex] * frac;
  }
  return output;
}

export function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function createWavHeader(
  dataLength: number,
  sampleRate = 16000,
  numChannels = 1,
  bitsPerSample = 16
): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataLength, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataLength, true);

  return new Uint8Array(buffer);
}

export function pcmToWav(pcm16: Int16Array, sampleRate = 16000): Uint8Array {
  const pcmBytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const header = createWavHeader(pcmBytes.length, sampleRate, 1, 16);
  const wav = new Uint8Array(header.length + pcmBytes.length);
  wav.set(header, 0);
  wav.set(pcmBytes, header.length);
  return wav;
}

export type AudioChunkHandler = (sourceIndex: number, pcmData: Int16Array) => void;

export interface AudioCaptureController {
  stop(): Promise<void>;
}

export async function startAudioCapture(
  sources: AudioSource[],
  onChunk: AudioChunkHandler
): Promise<AudioCaptureController> {
  const audioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new audioContextClass();

  const streams: MediaStream[] = [];
  const nodesToCleanup: Array<{ disconnect: () => void }> = [];

  const deviceIds = Array.from(new Set(sources.map((s) => s.deviceId ?? "default")));

  const streamsByDevice = new Map<string, MediaStream>();
  for (const deviceId of deviceIds) {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: { ideal: 2, min: 1 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId !== "default") {
      audioConstraints.deviceId = { exact: deviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });
    streams.push(stream);
    streamsByDevice.set(deviceId, stream);
  }

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const stream = streamsByDevice.get(source.deviceId ?? "default") ?? streams[0];
    const sourceNode = audioCtx.createMediaStreamSource(stream);
    nodesToCleanup.push(sourceNode);

    const bufferSize = 4096;
    const processor = audioCtx.createScriptProcessor(bufferSize, 2, 2);
    nodesToCleanup.push(processor);

    processor.onaudioprocess = (e) => {
      const ch0 = e.inputBuffer.getChannelData(0);
      const ch1 =
        e.inputBuffer.numberOfChannels > 1
          ? e.inputBuffer.getChannelData(1)
          : ch0;

      let extracted: Float32Array;
      if (source.kind === "channel") {
        extracted = channelPick([ch0, ch1], source.channel);
      } else {
        extracted = downmixChannels(ch0, ch1);
      }

      const resampled =
        audioCtx.sampleRate !== 16000
          ? resample(extracted, audioCtx.sampleRate, 16000)
          : extracted;

      const pcm16 = float32ToInt16(resampled);
      onChunk(i, pcm16);
    };

    sourceNode.connect(processor);
    processor.connect(audioCtx.destination);
  }

  return {
    async stop() {
      for (const node of nodesToCleanup) {
        try {
          node.disconnect();
        } catch {}
      }
      for (const stream of streams) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioCtx.state !== "closed") {
        await audioCtx.close();
      }
    },
  };
}
