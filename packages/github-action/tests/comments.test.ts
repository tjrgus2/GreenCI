import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOT_LOGIN,
  publishPullRequestComment,
} from '../src/adapters/comments.js';
import { fakeSource, httpError } from './fake-source.js';

const request = {
  owner: 'owner',
  repository: 'repo',
  pullRequestNumber: 3,
  body: '<!-- greenci-report:v1 workflow=".github/workflows/ci.yml" -->\nnew report',
  updateExisting: true,
  marker: '<!-- greenci-report:v1 workflow=".github/workflows/ci.yml" -->',
};

const marker = '<!-- greenci-report:v1 workflow=".github/workflows/ci.yml" -->';
const otherMarker =
  '<!-- greenci-report:v1 workflow=".github/workflows/nightly.yml" -->';

describe('pull-request comment publication', () => {
  it('creates a comment when none exists yet', async () => {
    let created = 0;
    const result = await publishPullRequestComment(
      fakeSource({
        async createIssueComment() {
          created += 1;
          return { id: 55 };
        },
      }),
      request,
    );
    expect(result.action).toBe('created');
    expect(result.commentId).toBe(55);
    expect(created).toBe(1);
  });

  it('updates the existing GreenCI comment instead of creating another', async () => {
    let updatedId: number | undefined;
    const result = await publishPullRequestComment(
      fakeSource({
        async listIssueComments() {
          return [
            {
              id: 1,
              body: `${marker} someone else copied the marker`,
              user: { login: 'attacker', type: 'User' },
            },
            {
              id: 2,
              body: `${marker}\nprevious report`,
              user: { login: DEFAULT_BOT_LOGIN, type: 'Bot' },
            },
          ];
        },
        async updateIssueComment(parameters) {
          updatedId = parameters.commentId;
          return { id: parameters.commentId };
        },
        async createIssueComment() {
          throw new Error('must not create a second comment');
        },
      }),
      request,
    );
    expect(result.action).toBe('updated');
    expect(updatedId).toBe(2);
  });

  it('never edits the comment owned by another GreenCI workflow', async () => {
    let created = 0;
    const result = await publishPullRequestComment(
      fakeSource({
        async listIssueComments() {
          return [
            {
              id: 3,
              body: `${otherMarker}\nreport from the nightly workflow`,
              user: { login: DEFAULT_BOT_LOGIN, type: 'Bot' },
            },
          ];
        },
        async updateIssueComment() {
          throw new Error("must not overwrite another workflow's comment");
        },
        async createIssueComment() {
          created += 1;
          return { id: 44 };
        },
      }),
      request,
    );
    expect(result.action).toBe('created');
    expect(created).toBe(1);
  });

  it('never edits a comment written by another account', async () => {
    const result = await publishPullRequestComment(
      fakeSource({
        async getAuthenticatedLogin() {
          return 'greenci-app[bot]';
        },
        async listIssueComments() {
          return [
            {
              id: 9,
              body: `${marker}\nnot ours`,
              user: { login: DEFAULT_BOT_LOGIN, type: 'Bot' },
            },
            { id: 10, body: `${marker}\nno author`, user: null },
          ];
        },
        async updateIssueComment() {
          throw new Error('must not update a foreign comment');
        },
      }),
      request,
    );
    expect(result.action).toBe('created');
  });

  it('creates a new comment when updating is disabled', async () => {
    const result = await publishPullRequestComment(
      fakeSource({
        async listIssueComments() {
          throw new Error('must not list comments');
        },
      }),
      { ...request, updateExisting: false },
    );
    expect(result.action).toBe('created');
  });

  it('falls back to the Job Summary when permission is denied', async () => {
    const result = await publishPullRequestComment(
      fakeSource({
        async listIssueComments() {
          throw httpError(403);
        },
      }),
      request,
    );
    expect(result.action).toBe('skipped');
    expect(result.warnings[0]?.code).toBe('PR_COMMENT_UNAVAILABLE');
  });

  it('still tries to create a comment when listing fails for another reason', async () => {
    const result = await publishPullRequestComment(
      fakeSource({
        async listIssueComments() {
          throw new Error('gateway');
        },
      }),
      request,
    );
    expect(result.action).toBe('created');
    expect(result.warnings[0]?.code).toBe('PR_COMMENT_FAILED');
  });

  it('reports a failed publication without failing the analysis', async () => {
    const result = await publishPullRequestComment(
      fakeSource({
        async createIssueComment() {
          throw httpError(500);
        },
      }),
      request,
    );
    expect(result.action).toBe('skipped');
    expect(result.warnings[0]?.code).toBe('PR_COMMENT_FAILED');
    expect(result.warnings[0]?.message).toContain('HTTP 500');
  });
});
