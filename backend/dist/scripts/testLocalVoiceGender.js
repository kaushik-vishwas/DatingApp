"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/bootstrapEnv");
const path_1 = __importDefault(require("path"));
const voiceGenderLocalClassifier_1 = require("../services/voiceGenderLocalClassifier");
async function main() {
    const fileArgIdx = process.argv.indexOf('--file');
    const urlArgIdx = process.argv.indexOf('--url');
    const expectedIdx = process.argv.indexOf('--expected');
    const file = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : null;
    const url = urlArgIdx >= 0 ? process.argv[urlArgIdx + 1] : null;
    const expected = expectedIdx >= 0 ? process.argv[expectedIdx + 1] : 'female';
    if (!file && !url) {
        console.error('Usage: npx tsx scripts/testLocalVoiceGender.ts --file <path> [--expected female|male]');
        console.error('   or: npx tsx scripts/testLocalVoiceGender.ts --url <https-url> [--expected female|male]');
        process.exit(1);
    }
    const source = url ?? path_1.default.resolve(file);
    console.log('[local-voice-gender] loading model (first run downloads weights)...');
    const result = await (0, voiceGenderLocalClassifier_1.classifyVoiceGenderLocally)(source, expected);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
