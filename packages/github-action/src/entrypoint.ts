import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import { createGitHubDataSource } from './adapters/github.js';
import { executeAction, type ActionIO } from './run.js';

function createActionIO(): ActionIO {
  const artifact = new DefaultArtifactClient();
  return {
    getInput: (name) => core.getInput(name),
    info: (message) => core.info(message),
    warning: (message) => core.warning(message),
    setOutput: (name, value) => core.setOutput(name, value),
    async writeSummary(markdown) {
      await core.summary.addRaw(markdown).write();
    },
    async uploadArtifact(name, files, rootDirectory) {
      await artifact.uploadArtifact(name, [...files], rootDirectory);
    },
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return 'Unexpected internal error';
}

async function main(): Promise<void> {
  try {
    await executeAction(createActionIO(), process.env, {
      createSource: createGitHubDataSource,
      now: () => new Date(),
      workingDirectory: process.cwd(),
    });
  } catch (error: unknown) {
    core.setFailed(`[GreenCI] ${safeErrorMessage(error)}`);
  }
}

void main();
