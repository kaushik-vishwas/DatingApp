"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Child process for local voice-gender classification.
 * Inherits env from the parent API process (fork env: process.env) — do not load dotenv here.
 */
const voiceGenderLocalCore_1 = require("./voiceGenderLocalCore");
process.on('message', (msg) => {
    void (async () => {
        try {
            if (msg.warmup) {
                await (0, voiceGenderLocalCore_1.warmVoiceGenderModel)();
                process.send?.({
                    id: msg.id,
                    ok: true,
                    result: {
                        ok: true,
                        predictedGender: 'unknown',
                        confidence: 0,
                        model: 'warmup',
                    },
                });
                return;
            }
            if (!msg.audioSource || !msg.expectedGender) {
                process.send?.({ id: msg.id, ok: false, error: 'Missing audioSource or expectedGender' });
                return;
            }
            const result = await (0, voiceGenderLocalCore_1.classifyVoiceGenderLocallyCore)(msg.audioSource, msg.expectedGender);
            process.send?.({ id: msg.id, ok: true, result });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            process.send?.({ id: msg.id, ok: false, error });
        }
    })();
});
process.on('uncaughtException', (err) => {
    console.error('[voice-gender-worker] uncaughtException:', err);
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    console.error('[voice-gender-worker] unhandledRejection:', err);
    process.exit(1);
});
