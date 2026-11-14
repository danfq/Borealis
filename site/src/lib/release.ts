/**
 * github repository borealis is released from
 */
export const REPO = "danfq/Borealis";

/**
 * repository page on github
 */
export const REPO_URL = `https://github.com/${REPO}`;

/**
 * page of the newest release, used when the api can't be reached
 */
export const LATEST_URL = `${REPO_URL}/releases/latest`;

/**
 * system an installer is built for
 */
export type Platform = "macos" | "windows" | "linux" | "arch";

/**
 * installer attached to a release
 */
export type Download = {
  name: string;
  url: string;

  /**
   * size in bytes
   */
  size: number;
};

/**
 * newest published release
 */
export type Release = {
  /**
   * version without the leading v, missing when the api can't be reached
   */
  version?: string;

  /**
   * publish date as an iso string
   */
  date?: string;

  /**
   * release page with the notes
   */
  url: string;
  downloads: Partial<Record<Platform, Download>>;
};

/**
 * asset name of each installer, as uploaded by the release workflow
 */
const ASSETS: Record<Platform, RegExp> = {
  macos: /\.dmg$/,
  windows: /-setup\.exe$/,
  linux: /\.AppImage$/,
  arch: /\.pkg\.tar\.zst$/,
};

/**
 * shape of the parts of the github api response that are used
 */
type GitHubRelease = {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};

/**
 * how long a release is served before github is asked again
 */
const MAX_AGE = 5 * 60 * 1000;

/**
 * used when github can't be reached and nothing was fetched yet
 */
const FALLBACK: Release = { url: LATEST_URL, downloads: {} };

/**
 * last release fetched and when
 */
let cached: { release: Release; at: number } | undefined;

/**
 * request in flight, shared by every page rendered meanwhile
 */
let pending: Promise<Release> | undefined;

/**
 * newest release, fetched from github at most every few minutes
 *
 * once cached, an outdated release is served right away while the newer one
 * is fetched, so pages never wait on github
 *
 * @returns {Promise<Release>} release
 */
export async function latestRelease(): Promise<Release> {
  if (!cached) return refresh();

  if (Date.now() - cached.at > MAX_AGE) void refresh();

  return cached.release;
}

/**
 * fetch the newest release and cache it, keeping the last one on failure
 *
 * @returns {Promise<Release>} release
 */
function refresh(): Promise<Release> {
  pending ??= fetchRelease()
    .catch((error) => {
      // retried once the cache is outdated again, so github isn't flooded
      console.warn("couldn't fetch the latest release", error);

      return cached?.release ?? FALLBACK;
    })
    .then((release) => {
      cached = { release, at: Date.now() };

      return release;
    })
    .finally(() => (pending = undefined));

  return pending;
}

/**
 * request the newest release from github
 *
 * a token in GH_TOKEN or GITHUB_TOKEN lifts the api rate limit
 *
 * @returns {Promise<Release>} release
 */
async function fetchRelease(): Promise<Release> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    },
  );

  if (!response.ok) throw new Error(`github responded ${response.status}`);

  const release = (await response.json()) as GitHubRelease;
  const downloads: Release["downloads"] = {};

  for (const [platform, pattern] of Object.entries(ASSETS)) {
    const asset = release.assets.find((asset) => pattern.test(asset.name));

    if (asset) {
      downloads[platform as Platform] = {
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
      };
    }
  }

  return {
    version: release.tag_name.replace(/^v/, ""),
    date: release.published_at,
    url: release.html_url,
    downloads,
  };
}

/**
 * format a size in bytes for people
 *
 * @param bytes size in bytes
 *
 * @returns {string} size like "5.7 MB"
 */
export function formatSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * format a release date for people
 *
 * @param date iso date
 *
 * @returns {string} date like "November 14, 2026"
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
