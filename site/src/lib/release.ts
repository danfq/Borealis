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
 * parts of a github release that are used, same in the api and in webhooks
 */
export type GitHubRelease = {
  tag_name: string;
  published_at: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
};

/**
 * used when github can't be reached and nothing was fetched yet
 */
const FALLBACK: Release = { url: LATEST_URL, downloads: {} };

/**
 * wait before asking github again after a failed request
 */
const RETRY_AFTER = 60 * 1000;

/**
 * release served to every visitor, replaced by the release webhook
 */
let current: Release | undefined;

/**
 * request in flight, shared by every page rendered meanwhile
 */
let pending: Promise<Release> | undefined;

/**
 * when github last failed to answer
 */
let failedAt = 0;

/**
 * newest release, kept in memory
 *
 * github is only asked once after the server starts, the release webhook
 * keeps it current from then on
 *
 * @returns {Promise<Release>} release
 */
export async function latestRelease(): Promise<Release> {
  if (current) return current;

  // github isn't flooded while it's down
  if (Date.now() - failedAt < RETRY_AFTER) return FALLBACK;

  return load();
}

/**
 * apply a release event sent by github
 *
 * a published release is taken as is, anything else like an edit or a
 * deletion may change which release is the latest, so github is asked
 *
 * @param action what happened to the release
 * @param release release from the event
 */
export async function onReleaseEvent(action: string, release: GitHubRelease) {
  const published = action === "published" || action === "released";

  if (published && !release.draft && !release.prerelease) {
    current = toRelease(release);
    return;
  }

  await load();
}

/**
 * fetch the newest release, keeping the current one on failure
 *
 * @returns {Promise<Release>} release
 */
function load(): Promise<Release> {
  pending ??= fetchRelease()
    .then((release) => (current = release))
    .catch((error) => {
      console.warn("couldn't fetch the latest release", error);
      failedAt = Date.now();

      return current ?? FALLBACK;
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

  return toRelease((await response.json()) as GitHubRelease);
}

/**
 * pick the installers and details shown on the site out of a github release
 *
 * @param release release from github
 *
 * @returns {Release} release
 */
function toRelease(release: GitHubRelease): Release {
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
