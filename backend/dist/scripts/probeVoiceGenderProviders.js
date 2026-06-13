"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/bootstrapEnv");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const inference_1 = require("@huggingface/inference");
async function probeUrl(label, url, token, bytes) {
    const rsp = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
        },
        body: bytes,
    });
    const text = await rsp.text();
    console.log(`\n=== ${label} ===`);
    console.log('status:', rsp.status);
    console.log('body:', text.slice(0, 500));
}
async function main() {
    const token = (process.env.HF_API_TOKEN ?? '').trim();
    if (!token) {
        console.error('HF_API_TOKEN missing');
        process.exit(1);
    }
    const bytes = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../frontend/assets/sounds/receiver_ringtone.mp3'));
    const hf = new inference_1.HfInference(token);
    await probeUrl('router audeering', 'https://router.huggingface.co/hf-inference/models/audeering/wav2vec2-large-robust-24-ft-age-gender', token, bytes);
    await probeUrl('router alefiury', 'https://router.huggingface.co/hf-inference/models/alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech', token, bytes);
    for (const provider of ['hf-inference', 'replicate', 'fal-ai']) {
        try {
            const result = await hf.audioClassification({
                model: 'alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech',
                data: new Uint8Array(bytes),
                provider,
            });
            console.log(`\n=== SDK audioClassification (${provider}) ===`);
            console.log(JSON.stringify(result, null, 2));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`\n=== SDK audioClassification (${provider}) FAILED ===`);
            console.log(msg);
        }
    }
}
main();
