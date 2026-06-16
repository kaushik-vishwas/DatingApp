"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/bootstrapEnv");
const voiceGenderLocalCore_1 = require("./voiceGenderLocalCore");
process.on('message', (msg) => {
    void (async () => {
        try {
            if (msg.warmup) {
                await (0, voiceGenderLocalCore_1.warmVoiceGenderModel)();
                const out = {
                    id: msg.id,
                    ok: true,
                    result: {
                        ok: true,
                        predictedGender: 'unknown',
                        confidence: 0,
                        model: 'warmup',
                    },
                };
                process.send?.(out);
                return;
            }
            if (!msg.audioSource || !msg.expectedGender) {
                const out = { id: msg.id, ok: false, error: 'Missing audioSource or expectedGender' };
                process.send?.(out);
                return;
            }
            const result = await (0, voiceGenderLocalCore_1.classifyVoiceGenderLocallyCore)(msg.audioSource, msg.expectedGender);
            const out = { id: msg.id, ok: true, result };
            process.send?.(out);
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const out = { id: msg.id, ok: false, error };
            process.send?.(out);
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
