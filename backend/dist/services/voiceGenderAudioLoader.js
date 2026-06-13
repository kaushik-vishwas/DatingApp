"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryWavUrl = cloudinaryWavUrl;
exports.loadVoiceAudioSamples = loadVoiceAudioSamples;
const promises_1 = __importDefault(require("fs/promises"));
const wavefile_1 = require("wavefile");
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
function wavBufferToSamples(buffer) {
    const wav = new wavefile_1.WaveFile(buffer);
    wav.toBitDepth('32f');
    wav.toSampleRate(TARGET_SAMPLE_RATE);
    const samples = wav.getSamples();
    const channel = Array.isArray(samples) ? samples[0] : samples;
    if (channel instanceof Float32Array)
        return channel;
    return Float32Array.from(channel);
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
