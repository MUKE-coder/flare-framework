import { describe, expect, it } from "vitest";
import { sniffMatches } from "../src/sniff.js";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? Array.from(part, (c) => c.charCodeAt(0)) : part)));

const SAMPLES = {
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR"),
  jpeg: bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"),
  gif: bytes("GIF89a", [1, 0, 1, 0]),
  webp: bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "),
  avif: bytes([0, 0, 0, 0x1c], "ftypavif"),
  pdf: bytes("%PDF-1.7\n"),
  zip: bytes([0x50, 0x4b, 0x03, 0x04], "docx-ish"),
  ole2: bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  mp4: bytes([0, 0, 0, 0x20], "ftypisom"),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3]),
  mp3: bytes("ID3", [4, 0]),
  wav: bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "),
  html: bytes("<!doctype html><script>"),
  text: bytes("name,email\nAda,ada@example.com\n"),
};

describe("sniffMatches", () => {
  it.each([
    ["image/png", SAMPLES.png],
    ["image/jpeg", SAMPLES.jpeg],
    ["image/gif", SAMPLES.gif],
    ["image/webp", SAMPLES.webp],
    ["image/avif", SAMPLES.avif],
    ["application/pdf", SAMPLES.pdf],
    ["application/zip", SAMPLES.zip],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", SAMPLES.zip],
    ["application/msword", SAMPLES.ole2],
    ["video/mp4", SAMPLES.mp4],
    ["video/webm", SAMPLES.webm],
    ["audio/mpeg", SAMPLES.mp3],
    ["audio/wav", SAMPLES.wav],
    ["text/csv", SAMPLES.text],
    ["IMAGE/PNG; charset=binary", SAMPLES.png],
  ])("accepts a real %s", (type, head) => {
    expect(sniffMatches(type, head)).toBe(true);
  });

  it.each([
    ["image/png", SAMPLES.html],
    ["image/png", SAMPLES.jpeg],
    ["image/jpeg", SAMPLES.pdf],
    ["application/pdf", SAMPLES.png],
    ["application/msword", SAMPLES.zip],
    ["video/mp4", SAMPLES.html],
    ["text/plain", SAMPLES.png],
    ["image/png", new Uint8Array()],
  ])("rejects %s whose bytes say otherwise", (type, head) => {
    expect(sniffMatches(type, head)).toBe(false);
  });

  it("stays out of the way for types it has no signature for", () => {
    expect(sniffMatches("application/x-custom", SAMPLES.html)).toBeUndefined();
    expect(sniffMatches("image/svg+xml", SAMPLES.html)).toBeUndefined();
  });
});
