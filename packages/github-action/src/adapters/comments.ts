import { z } from 'zod';
import type { AnalysisWarning } from '@greenci/core';
import { describeError, isNotFoundError, isPermissionError } from './errors.js';
import type { GitHubDataSource } from './github.js';

const CommentSchema = z
  .object({
    id: z.number().int().nonnegative(),
    body: z.string().nullable().optional(),
    user: z
      .object({ login: z.string(), type: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const CommentListSchema = z.array(CommentSchema);

/** The default GitHub Actions bot identity used when `users` is unreadable. */
export const DEFAULT_BOT_LOGIN = 'github-actions[bot]';

/** Outcome of publishing the GreenCI pull-request comment. */
export interface CommentPublication {
  readonly action: 'created' | 'updated' | 'skipped';
  readonly commentId: number | undefined;
  readonly warnings: AnalysisWarning[];
}

/** Where and what to publish. */
export interface CommentRequest {
  readonly owner: string;
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly body: string;
  readonly updateExisting: boolean;
  /**
   * The workflow-scoped GreenCI marker. Scoping matters: a repository can run
   * GreenCI from several workflows against one pull request, and each must own
   * its own comment.
   */
  readonly marker: string;
}

function ownsComment(
  comment: z.infer<typeof CommentSchema>,
  authenticatedLogin: string | undefined,
): boolean {
  const login = comment.user?.login;
  if (login === undefined) {
    return false;
  }
  if (authenticatedLogin !== undefined) {
    return login === authenticatedLogin;
  }
  return comment.user?.type === 'Bot' && login === DEFAULT_BOT_LOGIN;
}

function permissionWarning(error: unknown): AnalysisWarning {
  return {
    code: 'PR_COMMENT_UNAVAILABLE',
    source: 'github-api',
    message: `GreenCI could not write a pull-request comment (${describeError(error)}); the Job Summary and JSON report remain available.`,
  };
}

/**
 * Create or update exactly one GreenCI comment.
 *
 * A comment is only updated when it carries the GreenCI marker *and* is
 * authored by the identity behind the current token, so a comment written by
 * another user is never modified.
 */
export async function publishPullRequestComment(
  source: GitHubDataSource,
  request: CommentRequest,
): Promise<CommentPublication> {
  const warnings: AnalysisWarning[] = [];
  let existingId: number | undefined;

  if (request.updateExisting) {
    try {
      const authenticatedLogin = await source.getAuthenticatedLogin();
      const rawComments = await source.listIssueComments({
        owner: request.owner,
        repository: request.repository,
        issueNumber: request.pullRequestNumber,
      });
      const parsed = CommentListSchema.safeParse(rawComments);
      if (parsed.success) {
        existingId = parsed.data.find(
          (comment) =>
            (comment.body ?? '').includes(request.marker) &&
            ownsComment(comment, authenticatedLogin),
        )?.id;
      }
    } catch (error: unknown) {
      if (isPermissionError(error) || isNotFoundError(error)) {
        return {
          action: 'skipped',
          commentId: undefined,
          warnings: [permissionWarning(error)],
        };
      }
      warnings.push({
        code: 'PR_COMMENT_FAILED',
        source: 'github-api',
        message: `Existing GreenCI comments could not be listed (${describeError(error)}); a new comment will be created.`,
      });
    }
  }

  try {
    if (existingId !== undefined) {
      await source.updateIssueComment({
        owner: request.owner,
        repository: request.repository,
        commentId: existingId,
        body: request.body,
      });
      return { action: 'updated', commentId: existingId, warnings };
    }
    const created = await source.createIssueComment({
      owner: request.owner,
      repository: request.repository,
      issueNumber: request.pullRequestNumber,
      body: request.body,
    });
    const parsed = CommentSchema.safeParse(created);
    return {
      action: 'created',
      commentId: parsed.success ? parsed.data.id : undefined,
      warnings,
    };
  } catch (error: unknown) {
    if (isPermissionError(error) || isNotFoundError(error)) {
      return {
        action: 'skipped',
        commentId: undefined,
        warnings: [...warnings, permissionWarning(error)],
      };
    }
    return {
      action: 'skipped',
      commentId: undefined,
      warnings: [
        ...warnings,
        {
          code: 'PR_COMMENT_FAILED',
          source: 'github-api',
          message: `The GreenCI pull-request comment could not be published (${describeError(error)}).`,
        },
      ],
    };
  }
}
