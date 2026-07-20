#!/usr/bin/env node
import { createProgram } from './cli.js';

async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    process.stderr.write(`[GreenCI] ${message.slice(0, 500)}\n`);
    process.exitCode = 1;
  }
}

void main();
