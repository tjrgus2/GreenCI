import { z } from 'zod';
declare const ActionInputsSchema: z.ZodObject<{
    githubToken: z.ZodString;
    configPath: z.ZodString;
    locale: z.ZodEnum<{
        en: "en";
        ko: "ko";
    }>;
    baselineRuns: z.ZodCoercedNumber<unknown>;
    parseFailureLogs: z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>;
    uploadReportArtifact: z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>;
}, z.core.$strict>;
export type ActionInputs = z.infer<typeof ActionInputsSchema>;
/** Read and validate all declared Action inputs without exposing token values. */
export declare function parseActionInputs(getInput: (name: string) => string): ActionInputs;
export {};
//# sourceMappingURL=inputs.d.ts.map