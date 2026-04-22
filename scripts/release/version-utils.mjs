export function parseReleaseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatReleaseVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function compareReleaseVersions(a, b) {
  const parsedA = parseReleaseVersion(a);
  const parsedB = parseReleaseVersion(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }

  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }

  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }

  return 0;
}

export function incrementReleaseMinor(version) {
  const nextMinor = version.minor + 1;
  if (nextMinor > 9) {
    return {
      major: version.major + 1,
      minor: 0,
      patch: 0,
    };
  }

  return {
    major: version.major,
    minor: nextMinor,
    patch: 0,
  };
}

export function incrementReleasePatch(version) {
  const nextPatch = version.patch + 1;
  if (nextPatch > 99) {
    return incrementReleaseMinor(version);
  }

  return {
    major: version.major,
    minor: version.minor,
    patch: nextPatch,
  };
}

export function incrementPatchVersion(version) {
  const parsedVersion = parseReleaseVersion(version);
  if (!parsedVersion) {
    return version;
  }

  return formatReleaseVersion(incrementReleasePatch(parsedVersion));
}

export function getNextVersionFromPublished(publishedVersion, currentVersion) {
  if (typeof publishedVersion !== 'string' || publishedVersion.length === 0) {
    return currentVersion;
  }

  const nextPublishedPatch = incrementPatchVersion(publishedVersion);
  if (compareReleaseVersions(nextPublishedPatch, currentVersion) > 0) {
    return nextPublishedPatch;
  }

  return currentVersion;
}
