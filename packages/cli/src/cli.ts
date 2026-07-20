import { Command } from 'commander';
import { replayFixture } from './replay.js';

/** Build the GreenCI command-line interface. */
export function createProgram(): Command {
  const program = new Command();
  program
    .name('greenci')
    .description('Offline tools for GreenCI')
    .version('0.1.0');
  program
    .command('replay')
    .description('Analyze a sanitized normalized workflow fixture')
    .argument('<fixture>', 'path to the normalized JSON fixture')
    .option('-o, --output <path>', 'JSON report output', 'greenci-report.json')
    .action(async (fixture: string, options: { output: string }) => {
      const result = await replayFixture(fixture, options.output);
      process.stdout.write(result.markdown);
      process.stderr.write(`Report written to ${result.outputPath}\n`);
    });
  return program;
}
