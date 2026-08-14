import { z } from 'zod';
declare const ActionInputsSchema: z.ZodObject<{
    githubToken: z.ZodString;
    configPath: z.ZodString;
    locale: z.ZodOptional<z.ZodEnum<{
        en: "en";
        ko: "ko";
    }>>;
    baselineRuns: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
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
/**
 * Read and validate all declared Action inputs without exposing token values.
 *
 * `locale` and `baseline-runs` are intentionally left without an Action-level
 * default so that an unset input really does defer to `.greenci.yml` and then
 * to the bundled defaults.
 */
export declare function parseActionInputs(getInput: (name: string) => string): ActionInputs;
export {};
//# sourceMappingURL=inputs.d.ts.map