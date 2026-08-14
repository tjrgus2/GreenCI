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
    setFailed: (message) => core.setFailed(message),
    annotate: (annotation) => {
      const properties = {
        file: annotation.file,
        startLine: annotation.line,
        ...(annotation.column === undefined
          ? {}
          : { startColumn: annotation.column }),
      };
      if (annotation.severity === 'error') {
        core.error(annotation.message, properties);
      } else if (annotation.severity === 'warning') {
        core.warning(annotation.message, properties);
      } else {
        core.notice(annotation.message, properties);
      }
    },
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
