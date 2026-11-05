import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceType, sign } from "../templates/next/lib/storage/cloudinary.js";
import { diskBucket } from "../templates/next/lib/storage/disk.js";
import { customIdFor } from "../templates/next/lib/storage/uploadthing.js";

const text = async (body: ReadableStream) => new Response(body).text();

describe("the disk driver", () => {
  let dir: string;
  let bucket: ReturnType<typeof diskBucket>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flare-disk-"));
    bucket = diskBucket({ dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("gives back what it was given", async () => {
    await bucket.put("uploads/2026/09/a.png", "hello", { httpMetadata: { contentType: "image/png" } });
    const object = await bucket.get("uploads/2026/09/a.png");
    expect(object).not.toBeNull();
    expect(await text(object!.body)).toBe("hello");
    expect(object!.size).toBe(5);
  });

  it("remembers the content type rather than guessing from the name", async () => {
    // The point of the sidecar: a key with no extension still serves as an image.
    await bucket.put("uploads/photo", "x", { httpMetadata: { contentType: "image/jpeg" } });
    expect((await bucket.get("uploads/photo"))!.httpMetadata?.contentType).toBe("image/jpeg");
  });

  it("answers null for a key it has not got", async () => {
    expect(await bucket.get("nothing/here.png")).toBeNull();
  });

  it("deletes the object and its sidecar", async () => {
    await bucket.put("a/b.txt", "x", { httpMetadata: { contentType: "text/plain" } });
    await bucket.delete("a/b.txt");
    expect(await bucket.get("a/b.txt")).toBeNull();
    await expect(readFile(join(dir, "meta", "a", "b.txt.json"))).rejects.toThrow();
  });

  it("treats deleting what was never there as done", async () => {
    await expect(bucket.delete("never/existed")).resolves.toBeUndefined();
  });

  it("refuses a key that climbs out of the directory", async () => {
    // createStorage rejects these before a bucket sees them. This is the second lock.
    await expect(bucket.put("../escaped.txt", "x")).rejects.toThrow(/escapes the storage directory/);
    await expect(bucket.get("../../etc/passwd")).rejects.toThrow(/escapes the storage directory/);
  });

  it("is private: it offers no public URL", () => {
    // Reads stay signed and proxied, so a policy still decides who sees a file.
    expect(bucket.publicUrl).toBeUndefined();
  });

  it("overwrites rather than appending when a key is written twice", async () => {
    await bucket.put("k.txt", "first", { httpMetadata: { contentType: "text/plain" } });
    await bucket.put("k.txt", "second", { httpMetadata: { contentType: "text/plain" } });
    expect(await text((await bucket.get("k.txt"))!.body)).toBe("second");
  });
});

describe("the Cloudinary signature", () => {
  // Both vectors are Cloudinary's own worked examples, from their signature docs.
  it("signs a timestamp the way Cloudinary documents", async () => {
    expect(await sign({ timestamp: "1315060510" }, "abcd")).toBe("a21ad0f63beb4de2e5575204b79ab90bffb02c10");
  });

  it("sorts the parameters by name before signing", async () => {
    const signature = await sign(
      { public_id: "sample_image", timestamp: "1315060510", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" },
      "abcd",
    );
    expect(signature).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("does not depend on the order they were written in", async () => {
    const a = await sign({ timestamp: "1", public_id: "x" }, "s");
    const b = await sign({ public_id: "x", timestamp: "1" }, "s");
    expect(a).toBe(b);
  });
});

describe("the Cloudinary resource type", () => {
  it("files images as images, so the delivery URL is the image pipeline", () => {
    for (const key of ["a.png", "a.JPG", "u/b.webp", "c.avif"]) expect(resourceType(key), key).toBe("image");
  });

  it("files audio under video, which is how Cloudinary files it", () => {
    for (const key of ["a.mp4", "a.mp3", "a.wav"]) expect(resourceType(key), key).toBe("video");
  });

  it("falls back to raw, which serves the bytes unchanged", () => {
    for (const key of ["a.pdf", "a.csv", "noextension"]) expect(resourceType(key), key).toBe("raw");
  });
});

describe("an UploadThing customId", () => {
  it("flattens a key into one URL path segment", () => {
    // The delivery URL is <app>.ufs.sh/f/<customId>, so a slash would change the path.
    expect(customIdFor("uploads/2026/09/abc-photo.png")).toBe("uploads_2f2026_2f09_2fabc-photo.png");
  });

  it("keeps the uuid that makes a key unique", () => {
    const id = customIdFor("uploads/2026/09/3f1c9a2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b-report.pdf");
    expect(id).toContain("3f1c9a2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b");
  });

  it("is stable, because delete has to recompute what upload used", () => {
    const key = "uploads/2026/09/a b+c&d.png";
    expect(customIdFor(key)).toBe(customIdFor(key));
    expect(customIdFor(key)).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("keeps two different keys apart", () => {
    expect(customIdFor("a/b.png")).not.toBe(customIdFor("a__b.png"));
  });
});
