/**
 * Host tag for HTTP client entries, e.g. `host:api.stripe.com`.
 * Shared by the write path (HttpClientWatcher) and the read path (TraceStorage.getClientHosts).
 */
export const HOST_TAG_PREFIX = 'host:';

const resolveHostTag = (url: string): string | undefined => {
  try {
    const hostname = new URL(url).hostname;
    return hostname === '' ? undefined : `${HOST_TAG_PREFIX}${hostname}`;
  } catch {
    // Relative or malformed URLs have no host to group by.
    return undefined;
  }
};

export const HostTag = Object.freeze({
  prefix: HOST_TAG_PREFIX,
  resolve: resolveHostTag,
});

export default HostTag;
