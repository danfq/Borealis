/**
 * cut a release from the commits since the last one
 *
 * every commit bumps the version in order, then the bump is committed, tagged
 * and pushed, and the tag makes ci build and publish the installers
 *
 * usage: just release [--dry-run] [--yes]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { $ } from "bun";

/**
 * how far a commit moves the version
 */
type Level = "major" | "minor" | "patch";

/**
 * commit since the last release
 */
type Commit = {
  hash: string;
  subject: string;
  level: Level;
};

/**
 * files holding the version and how to rewrite it in each
 */
const FILES: { path: string; pattern: RegExp }[] = [
  { path: "package.json", pattern: /("version": ")[^"]+(")/ },
  { path: "src-tauri/Cargo.toml", pattern: /^(version = ")[^"]+(")/m },
  {
    path: "src-tauri/Cargo.lock",
    pattern: /(name = "borealis"\nversion = ")[^"]+(")/,
  },
  { path: "packaging/arch/PKGBUILD", pattern: /^(pkgver=)[^\n]+()/m },
];

/**
 * branch releases are cut from
 */
const BRANCH = "main";

/**
 * highest value of the minor and patch segments, going past it rolls over
 */
const LIMIT = 9;

/**
 * order of the segments in a version
 */
const SEGMENTS: Level[] = ["major", "minor", "patch"];

/**
 * how far a commit moves the version, breaking changes are major, features
 * minor and everything else patch
 *
 * @param subject commit subject
 * @param body commit body
 *
 * @returns {Level} bump level
 */
export function classify(subject: string, body: string): Level {
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);

  if (match?.[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return "major";
  if (match?.[1] === "feat") return "minor";

  return "patch";
}

/**
 * move a version by one step
 *
 * the segments after the bumped one reset, and minor or patch going past the
 * limit rolls over into the segment before it, the major segment has no limit
 *
 * @param version current version
 * @param level bump level
 *
 * @returns {number[]} next version
 */
export function increment(version: number[], level: Level): number[] {
  let index = SEGMENTS.indexOf(level);
  const next = version.map((segment, i) =>
    i < index ? segment : i === index ? segment + 1 : 0,
  );

  while (index > 0 && next[index]! > LIMIT) {
    next[index] = 0;
    next[--index]! += 1;
  }

  return next;
}

/**
 * parse a version like 1.2.3
 *
 * @param version version text
 *
 * @returns {number[]} segments
 */
function parse(version: string): number[] {
  const segments = version.split(".").map(Number);

  if (segments.length !== 3 || segments.some((s) => !Number.isInteger(s))) {
    throw new Error(`invalid version: ${version}`);
  }

  return segments;
}

/**
 * stop with a message
 *
 * @param message reason
 */
function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

/**
 * make sure the release starts from an up to date and clean main, a dry run
 * only fetches the tags since it changes nothing
 *
 * @param dryRun whether nothing gets released
 */
async function preflight(dryRun: boolean) {
  if (dryRun) {
    await $`git fetch --quiet --tags origin`;
    return;
  }

  const branch = (await $`git branch --show-current`.text()).trim();

  if (branch !== BRANCH) fail(`releases are cut from ${BRANCH}, not ${branch}`);

  if ((await $`git status --porcelain`.text()).trim()) {
    fail("the working tree has uncommitted changes");
  }

  await $`git fetch --quiet --tags origin ${BRANCH}`;

  const behind = (
    await $`git rev-list --count HEAD..origin/${BRANCH}`.text()
  ).trim();

  if (behind !== "0") fail(`${BRANCH} is behind origin, pull first`);
}

/**
 * tag of the last release, none before the first one
 *
 * @returns {Promise<string | undefined>} tag
 */
async function lastRelease(): Promise<string | undefined> {
  // interpolated so the shell doesn't expand it against local files
  const pattern = "v*";
  const tag = await $`git describe --tags --abbrev=0 --match ${pattern}`
    .quiet()
    .nothrow();

  return tag.exitCode === 0 ? tag.text().trim() : undefined;
}

/**
 * commits since a release, oldest first, merges are left out as their
 * commits are already counted
 *
 * @param since tag of the last release, every commit counts before the first
 *
 * @returns {Promise<Commit[]>} commits
 */
async function commitsSince(since?: string): Promise<Commit[]> {
  const range = since ? `${since}..HEAD` : "HEAD";
  const log =
    await $`git log ${range} --reverse --no-merges --format=%h%x1f%s%x1f%b%x1e`.text();

  return log
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", subject = "", body = ""] = entry.split("\x1f");

      return { hash, subject, level: classify(subject, body) };
    });
}

/**
 * release notes grouped by level, kept in the tag and used by ci
 *
 * @param commits commits in the release
 *
 * @returns {string} notes in markdown
 */
function notes(commits: Commit[]): string {
  const sections: [Level, string][] = [
    ["major", "Breaking changes"],
    ["minor", "Features"],
    ["patch", "Fixes and other changes"],
  ];

  const body = sections
    .map(([level, title]) => {
      const lines = commits
        .filter((commit) => commit.level === level)
        .map((commit) => `- ${commit.subject} (${commit.hash})`);

      return lines.length ? `## ${title}\n\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  // git only tells a tag signature apart when it starts on its own line
  return `${body}\n`;
}

/**
 * write the version into every file holding it
 *
 * @param version new version
 */
function bump(version: string) {
  for (const { path, pattern } of FILES) {
    const text = readFileSync(path, "utf8");

    if (!pattern.test(text)) fail(`no version found in ${path}`);

    writeFileSync(path, text.replace(pattern, `$1${version}$2`));
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");

  await preflight(dryRun);

  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const since = await lastRelease();

  // the first release counts the whole history
  const commits = await commitsSince(since);

  if (commits.length === 0) fail(`nothing to release since ${since}`);

  const version = commits
    .reduce(
      (version, commit) => increment(version, commit.level),
      parse(current),
    )
    .join(".");
  const tag = `v${version}`;

  if ((await $`git tag --list ${tag}`.text()).trim())
    fail(`${tag} exists already`);

  console.log(
    since
      ? `commits since ${since}:\n`
      : "first release, counting every commit:\n",
  );

  for (const commit of commits) {
    console.log(
      `  ${commit.level.padEnd(5)}  ${commit.hash}  ${commit.subject}`,
    );
  }

  console.log(`\nversion: ${current} -> ${version}`);

  if (dryRun) return;

  if (
    !args.has("--yes") &&
    prompt(`release ${tag}? [y/N]`)?.toLowerCase() !== "y"
  ) {
    fail("cancelled");
  }

  if (version !== current) {
    bump(version);

    await $`git add ${FILES.map((file) => file.path)}`;
    await $`git commit --quiet -m ${`chore(release): ${tag}`}`;
  }

  // the tag carries the notes, ci turns them into the release description
  // verbatim keeps the markdown headings git would take for comments
  await $`git tag --annotate --cleanup=verbatim ${tag} --file=- < ${Buffer.from(notes(commits))}`;
  await $`git push --atomic --quiet origin ${BRANCH} ${tag}`;

  console.log(`\npushed ${tag}, ci builds and publishes it`);
}

if (import.meta.main) await main();
