import { createHmac, timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { onReleaseEvent, type GitHubRelease } from "../../lib/release";

export const prerender = false;

/**
 * check that a webhook was signed by github with the shared secret
 *
 * @param body raw request body
 * @param signature value of the x-hub-signature-256 header
 * @param secret secret set on the webhook
 *
 * @returns {boolean} whether the signature matches
 */
function verify(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const given = Buffer.from(signature);

  return (
    given.length === expected.length &&
    timingSafeEqual(given, Buffer.from(expected))
  );
}

/**
 * github webhook for release events, so the site shows a release the moment
 * it's published
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) return new Response("webhook isn't set up", { status: 503 });

  const body = await request.text();

  if (!verify(body, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  // sent once when the webhook is created
  const event = request.headers.get("x-github-event");

  if (event === "ping") return new Response("pong");
  if (event !== "release") return new Response("ignored", { status: 202 });

  const payload = JSON.parse(body) as {
    action: string;
    release: GitHubRelease;
  };

  await onReleaseEvent(payload.action, payload.release);

  return new Response("updated");
};
