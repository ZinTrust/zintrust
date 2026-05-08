export function parseCommitMessagesFromGitLogOutput(output) {
  if (typeof output !== 'string' || output.trim() === '') {
    return [];
  }

  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [, message = ''] = entry.split('\x1f');
      return message.trim();
    })
    .filter(Boolean);
}

export function isReleaseCommit(message) {
  return message.startsWith('chore(release):');
}

export function detectCommitBump(message) {
  const lower = message.toLowerCase();

  if (lower.includes('breaking change') || lower.includes('breaking-change')) {
    return 'major';
  }

  const firstLine = message.split('\n')[0] ?? '';
  if (/^[a-z]+(\([^)]+\))?!:/.test(firstLine)) {
    return 'major';
  }

  if (/^feat(\([^)]+\))?:/.test(firstLine)) {
    return 'minor';
  }

  if (/^fix(\([^)]+\))?:/.test(firstLine)) {
    return 'patch';
  }

  return 'none';
}

export function detectBump(messages, strategy) {
  let bump = 'none';

  const mark = (next) => {
    if (next === 'major') bump = 'major';
    else if (next === 'minor' && bump !== 'major') bump = 'minor';
    else if (next === 'patch' && bump === 'none') bump = 'patch';
  };

  for (const message of messages) {
    if (isReleaseCommit(message)) continue;
    const next = detectCommitBump(message);
    if (next === 'none') continue;

    if (strategy === 'patch-only') {
      return 'patch';
    }

    mark(next);
  }

  return bump;
}
