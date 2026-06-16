"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryWavUrl = cloudinaryWavUrl;
exports.loadVoiceAudioSamples = loadVoiceAudioSamples;
const promises_1 = __importDefault(require("fs/promises"));
const TARGET_SAMPLE_RATE = 16000;
function isHttpUrl(source) {
    return /^https?:\/\//i.test(source);
}
/** Ask Cloudinary to deliver WAV (works for uploaded m4a/mp3 voice samples). */
function cloudinaryWavUrl(url) {
    if (!/res\.cloudinary\.com/i.test(url) || !/\/upload\//i.test(url))
        return url;
    if (/\/upload\/(?:[^/]+\/)*f_wav(?:[_,/]|$)/i.test(url))
        return url;
    return url.replace('/upload/', '/upload/f_wav/');
}
async function loadAudioBytes(source) {
    if (isHttpUrl(source)) {
        const rsp = await fetch(source, { method: 'GET' });
        if (!rsp.ok) {
            throw new Error(`Could not fetch audio URL (HTTP ${rsp.status})`);
        }
        return Buffer.from(await rsp.arrayBuffer());
    }
    return promises_1.default.readFile(source);
}
function resampleTo16k(input, inputSampleRate) {
    if (inputSampleRate === TARGET_SAMPLE_RATE)
        return input;
    const outputLength = Math.max(1, Math.round((input.length * TARGET_SAMPLE_RATE) / inputSampleRate));
    const output = new Float32Array(outputLength);
    const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
    for (let i = 0; i < outputLength; i += 1) {
        const position = i * ratio;
        const index = Math.floor(position);
        const next = Math.min(index + 1, input.length - 1);
        const weight = position - index;
        output[i] = (input[index] ?? 0) * (1 - weight) + (input[next] ?? 0) * weight;
    }
    return output;
}
/** Minimal WAV decoder for Cloudinary `f_wav` output — no extra npm packages. */
function wavBufferToSamples(buffer) {
    if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
        throw new Error('Invalid WAV file');
    }
    let sampleRate = 44100;
    let numChannels = 1;
    let bitsPerSample = 16;
    let audioFormat = 1;
    let dataOffset = -1;
    let dataSize = 0;
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        const chunkDataStart = offset + 8;
        if (chunkId === 'fmt ' && chunkSize >= 16) {
            audioFormat = buffer.readUInt16LE(chunkDataStart);
            numChannels = buffer.readUInt16LE(chunkDataStart + 2);
            sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
            bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
        }
        else if (chunkId === 'data') {
            dataOffset = chunkDataStart;
            dataSize = chunkSize;
            break;
        }
        offset = chunkDataStart + chunkSize + (chunkSize % 2);
    }
    if (dataOffset < 0 || dataSize <= 0) {
        throw new Error('WAV data chunk not found');
    }
    const availableDataBytes = Math.max(0, buffer.length - dataOffset);
    dataSize = Math.min(dataSize, availableDataBytes);
    if (dataSize <= 0) {
        throw new Error('WAV data chunk is truncated');
    }
    if (audioFormat !== 1 && audioFormat !== 3) {
        throw new Error(`Unsupported WAV format (${audioFormat})`);
    }
    const frameCount = Math.floor(dataSize / (bitsPerSample / 8) / Math.max(1, numChannels));
    const mono = new Float32Array(frameCount);
    if (audioFormat === 3 && bitsPerSample === 32) {
        for (let i = 0; i < frameCount; i += 1) {
            let sum = 0;
            for (let ch = 0; ch < numChannels; ch += 1) {
                const sampleOffset = dataOffset + (i * numChannels + ch) * 4;
                if (sampleOffset + 4 > buffer.length)
                    break;
                sum += buffer.readFloatLE(sampleOffset);
            }
            mono[i] = sum / numChannels;
        }
    }
    else if (audioFormat === 1 && bitsPerSample === 16) {
        for (let i = 0; i < frameCount; i += 1) {
            let sum = 0;
            for (let ch = 0; ch < numChannels; ch += 1) {
                const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
                if (sampleOffset + 2 > buffer.length)
                    break;
                sum += buffer.readInt16LE(sampleOffset) / 32768;
            }
            mono[i] = sum / numChannels;
        }
    }
    else {
        throw new Error(`Unsupported WAV bit depth (${bitsPerSample}-bit)`);
    }
    return resampleTo16k(mono, sampleRate);
}
/** Decode voice audio from Cloudinary HTTPS URL or local .wav path into 16kHz mono Float32Array. */
async function loadVoiceAudioSamples(source) {
    const fetchSource = isHttpUrl(source) ? cloudinaryWavUrl(source) : source;
    const bytes = await loadAudioBytes(fetchSource);
    try {
        return wavBufferToSamples(bytes);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Could not decode voice audio as WAV: ${msg}`);
    }
}
