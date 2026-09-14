import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { deleteUserAvatar, getUserAvatar, saveUserAvatar } from "../src/uploads.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("user avatar storage saves per user, validates images, replaces, and deletes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ofp-avatar-"));
  const previous = process.env.NNPUPLOAD_DIR;
  process.env.NNPUPLOAD_DIR = directory;
  try {
    const saved = await saveUserAvatar("org-1", "user-a", { stream: Readable.from(PNG), filenameHint: "me.png" });
    assert.equal(saved.contentType, "image/png");
    assert.equal(saved.fileSize, PNG.length);

    const stored = await getUserAvatar("org-1", "user-a");
    assert.equal(stored?.contentType, "image/png");
    assert.deepEqual(stored?.buffer, PNG);

    // A non-image upload must be rejected (415) and must not clobber the existing avatar.
    await assert.rejects(
      saveUserAvatar("org-1", "user-a", { stream: Readable.from(Buffer.from("not an image")) }),
      /PNG, JPEG, or WebP/,
    );
    assert.deepEqual((await getUserAvatar("org-1", "user-a"))?.buffer, PNG);

    // Replacing uses a temp file so an interrupted write never leaves a torn image.
    const secondLogo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNgAAMAAMAAAEK2YUsAAAAASUVORK5CYII=", "base64");
    await saveUserAvatar("org-1", "user-a", { stream: Readable.from(secondLogo), filenameHint: "again.png" });
    assert.deepEqual((await getUserAvatar("org-1", "user-a"))?.buffer, secondLogo);

    // Per-user isolation and deletion.
    await deleteUserAvatar("org-1", "user-a");
    assert.equal(await getUserAvatar("org-1", "user-a"), null);
    assert.equal(await getUserAvatar("org-1", "user-b"), null);
  } finally {
    if (previous === undefined) delete process.env.NNPUPLOAD_DIR;
    else process.env.NNPUPLOAD_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});