import type { AnalysisWarning } from '@greenci/core';
import type { GitHubDataSource } from './github.js';
/** The default GitHub Actions bot identity used when `users` is unreadable. */
export declare const DEFAULT_BOT_LOGIN = "github-actions[bot]";
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
/**
 * Create or update exactly one GreenCI comment.
 *
 * A comment is only updated when it carries the GreenCI marker *and* is
 * authored by the identity behind the current token, so a comment written by
 * another user is never modified.
 */
export declare function publishPullRequestComment(source: GitHubDataSource, request: CommentRequest): Promise<CommentPublication>;
//# sourceMappingURL=comments.d.ts.map