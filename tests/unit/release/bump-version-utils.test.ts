import { describe, expect, it } from 'vitest';

import {
  detectBump,
  parseCommitMessagesFromGitLogOutput,
} from '../../../scripts/ci/bump-version-utils.mjs';

describe('bump-version utils', () => {
  it('keeps a commit body with feat paragraphs attached to the chore commit', () => {
    const output = [
      'fd71bb17cde384b570aa7ae33900f6a284f5a325',
      '\x1f',
      'chore: bump versions for core and trace packages to 1.8.1\n\n',
      'feat(trace): enhance HTML preview handling in dashboard UI\n',
      '- Added logic to detect flattened HTML and provide user feedback when HTML preview is unavailable.\n\n',
      'feat(cli): improve version checking mechanism\n',
      '- Introduced detached child process for version checks to avoid blocking the main process.\n',
      '\x1e',
    ].join('');

    const messages = parseCommitMessagesFromGitLogOutput(output);

    expect(messages).toHaveLength(1);
    expect(
      messages[0]?.startsWith('chore: bump versions for core and trace packages to 1.8.1')
    ).toBe(true);
    expect(detectBump(messages, 'conventional')).toBe('none');
  });

  it('still detects real feat commits as a minor bump', () => {
    const output = [
      'abc123\x1ffeat(storage): add Workers R2 fallback\x1e',
      'def456\x1fchore(release): v1.8.3\x1e',
    ].join('');

    const messages = parseCommitMessagesFromGitLogOutput(output);

    expect(messages).toHaveLength(2);
    expect(detectBump(messages, 'conventional')).toBe('minor');
  });
});
