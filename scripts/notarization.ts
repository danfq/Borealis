/**
 * keep the macos notarization note of each release up to date
 *
 * the release workflow submits the dmg to apple without waiting and leaves a
 * note in the release, the notarization workflow then checks on apple every
 * few minutes and rewrites the note once apple is done
 *
 * usage:
 *   bun scripts/notarization.ts start <tag> <submission id>
 *   bun scripts/notarization.ts unsigned <tag>
 *   bun scripts/notarization.ts check
 *
 * needs GH_TOKEN, plus APPLE_API_KEY, APPLE_API_ISSUER and
 * APPLE_API_PRIVATE_KEY (or APPLE_API_KEY_PATH) to check
 */
import { appendFileSync, readFileSync } from "node:fs";
import { $ } from "bun";

/**
 * where the notarization of a release stands
 */
export type State = "pending" | "accepted" | "rejected" | "unsigned";

/**
 * release as returned by the github api
 */
type Release = {
  id: number;
  tag_name: string;
  body: string | null;
};

/**
 * apple's notary api, one submission per id
 */
const NOTARY = "https://appstoreconnect.apple.com/notary/v2/submissions";

/**
 * comments around the note, the opening one carries the submission and state
 */
const NOTE =
  /<!-- notarization: (\S+) (\w+) -->[\s\S]*?<!-- \/notarization -->\n*/;

/**
 * what users read for each state
 */
const MESSAGES: Record<State, string> = {
  pending:
    "> [!NOTE]\n> Apple is still notarizing the macOS build. Until it's done, macOS may ask you to confirm the first time you open Borealis. This note updates on its own.",
  accepted: "> [!TIP]\n> The macOS build is notarized by Apple.",
  rejected:
    "> [!WARNING]\n> The macOS build isn't notarized, so macOS asks you to confirm the first time you open Borealis. Go to **System Settings → Privacy & Security** and click **Open Anyway**.",
  unsigned:
    "> [!WARNING]\n> The macOS build isn't notarized, so macOS asks you to confirm the first time you open Borealis. Go to **System Settings → Privacy & Security** and click **Open Anyway**.",
};

/**
 * note for a release, the submission id stays hidden in the comment
 *
 * @param submission apple submission id, "-" when nothing was submitted
 * @param state notarization state
 *
 * @returns {string} note in markdown
 */
export function note(submission: string, state: State): string {
  return `<!-- notarization: ${submission} ${state} -->\n${MESSAGES[state]}\n<!-- /notarization -->\n\n`;
}

/**
 * put a note at the top of a release body, replacing the previous one
 *
 * @param body release body
 * @param block note to put in
 *
 * @returns {string} new body
 */
export function withNote(body: string, block: string): string {
  return block + body.replace(NOTE, "");
}

/**
 * submission and state of the note in a release body
 *
 * @param body release body
 *
 * @returns {{ submission: string; state: string } | undefined} note, if any
 */
export function readNote(
  body: string,
): { submission: string; state: string } | undefined {
  const match = NOTE.exec(body);

  return match ? { submission: match[1]!, state: match[2]! } : undefined;
}

/**
 * state of a release note for an apple submission status
 *
 * @param status apple status, like "In Progress" or "Accepted"
 *
 * @returns {State} note state
 */
export function stateOf(status: string): State {
  if (status === "Accepted") return "accepted";
  if (status === "Invalid" || status === "Rejected") return "rejected";

  return "pending";
}

/**
 * stop with a message
 *
 * @param message reason
 */
function fail(message: string): never {
  console.error(`notarization: ${message}`);
  process.exit(1);
}

/**
 * read a required environment variable
 *
 * @param name variable name
 *
 * @returns {string} value
 */
function env(name: string): string {
  return process.env[name] || fail(`${name} is not set`);
}

/**
 * repository the releases belong to
 *
 * @returns {Promise<string>} owner and name
 */
async function repository(): Promise<string> {
  return (
    process.env.GITHUB_REPOSITORY ??
    (
      await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()
    ).trim()
  );
}

/**
 * every release, drafts included
 *
 * @returns {Promise<Release[]>} releases
 */
async function releases(): Promise<Release[]> {
  const repo = await repository();

  return (await $`gh api repos/${repo}/releases --paginate`.json()) as Release[];
}

/**
 * replace the body of a release
 *
 * @param release release to edit
 * @param body new body
 */
async function save(release: Release, body: string) {
  const repo = await repository();

  await $`gh api --method PATCH repos/${repo}/releases/${release.id} --field body=@- < ${Buffer.from(body)}`.quiet();
}

/**
 * find a release by its tag
 *
 * @param tag release tag
 *
 * @returns {Promise<Release>} release
 */
async function byTag(tag: string): Promise<Release> {
  return (
    (await releases()).find((release) => release.tag_name === tag) ??
    fail(`no release for ${tag}`)
  );
}

/**
 * token for apple's apis, signed with the app store connect key
 *
 * @returns {Promise<string>} json web token
 */
export async function appleToken(): Promise<string> {
  const pem =
    process.env.APPLE_API_PRIVATE_KEY ||
    readFileSync(env("APPLE_API_KEY_PATH"), "utf8");
  const der = Buffer.from(
    pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    "base64",
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const unsigned = `${encode({ alg: "ES256", kid: env("APPLE_API_KEY"), typ: "JWT" })}.${encode(
    {
      iss: env("APPLE_API_ISSUER"),
      iat: now,
      exp: now + 600,
      aud: "appstoreconnect-v1",
    },
  )}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(unsigned),
  );

  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

/**
 * status apple reports for a submission
 *
 * @param submission submission id
 * @param token apple api token
 *
 * @returns {Promise<string>} status, like "In Progress" or "Accepted"
 */
export async function appleStatus(
  submission: string,
  token: string,
): Promise<string> {
  const response = await fetch(`${NOTARY}/${submission}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) fail(`apple answered ${response.status} for ${submission}`);

  const { data } = (await response.json()) as {
    data: { attributes: { status: string } };
  };

  return data.attributes.status;
}

/**
 * update every pending note and report how many are still pending
 *
 * @returns {Promise<number>} releases still waiting on apple
 */
async function check(): Promise<number> {
  const pending = (await releases()).filter(
    (release) => readNote(release.body ?? "")?.state === "pending",
  );

  if (pending.length === 0) return 0;

  const token = await appleToken();
  let waiting = 0;

  for (const release of pending) {
    const { submission } = readNote(release.body!)!;
    const status = await appleStatus(submission, token);
    const state = stateOf(status);

    console.log(`${release.tag_name}: ${status}`);

    if (state === "pending") {
      waiting++;
      continue;
    }

    await save(release, withNote(release.body!, note(submission, state)));
  }

  return waiting;
}

async function main() {
  const [command, tag, submission] = process.argv.slice(2);

  switch (command) {
    case "start":
    case "unsigned": {
      if (!tag) fail("missing tag");
      if (command === "start" && !submission) fail("missing submission id");

      const release = await byTag(tag);
      const block =
        command === "start"
          ? note(submission!, "pending")
          : note("-", "unsigned");

      await save(release, withNote(release.body ?? "", block));
      break;
    }

    case "check": {
      const waiting = await check();

      console.log(`pending: ${waiting}`);

      // lets the workflow turn itself off once apple is done
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `pending=${waiting}\n`);
      }

      break;
    }

    default:
      fail("usage: notarization.ts start <tag> <id> | unsigned <tag> | check");
  }
}

if (import.meta.main) await main();
