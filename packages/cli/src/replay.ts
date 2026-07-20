import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AnalyzeWorkflowInputSchema,
  analyzeWorkflow,
  renderJobSummary,
  type AnalysisReport,
} from '@greenci/core';

/** Replay one sanitized fixture and write its versioned JSON report. */
export async function replayFixture(
  inputPath: string,
  outputPath = 'greenci-report.json',
): Promise<{ report: AnalysisReport; markdown: string; outputPath: string }> {
  const inputContents = await readFile(resolve(inputPath), 'utf8');
  const parsed: unknown = JSON.parse(inputContents) as unknown;
  const input = AnalyzeWorkflowInputSchema.parse(parsed);
  const report = analyzeWorkflow(input);
  const resolvedOutput = resolve(outputPath);
  await writeFile(
    resolvedOutput,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  return {
    report,
    markdown: renderJobSummary(report),
    outputPath: resolvedOutput,
  };
}
