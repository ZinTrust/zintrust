function compareVersions(a, b) {
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export function isPublishableFromNpmState(dirName, localVersion, publishedVersion, changedDirs) {
  if (changedDirs !== undefined && !changedDirs.has(dirName)) return false;
  if (publishedVersion === null) return true;
  return compareVersions(localVersion, publishedVersion) > 0;
}
