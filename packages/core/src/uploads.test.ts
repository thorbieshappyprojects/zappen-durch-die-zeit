import { describe, expect, it } from "vitest";
import { checkUploadSizes, checkUploadsBeforeSending, sanitizeFilename, sniffUpload, uploadTypeError } from "./uploads";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffUpload", () => {
  it("recognises images and PDFs by content", () => {
    expect(sniffUpload(bytes([0xff, 0xd8, 0xff, 0xe0]), "scan.png")?.mime).toBe("image/jpeg");
    expect(sniffUpload(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "x")?.mime).toBe("image/png");
    expect(sniffUpload(bytes("RIFF", [0, 0, 0, 0], "WEBP"), "a.webp")?.mime).toBe("image/webp");
    expect(sniffUpload(bytes([0, 0, 0, 24], "ftypheic"), "IMG_1.HEIC")?.mime).toBe("image/heic");
    expect(sniffUpload(bytes("%PDF-1.4\n"), "hoerzu.pdf")).toEqual({ kind: "pdf", mime: "application/pdf", ext: "pdf" });
  });
  it("accepts text only for text extensions and without binary content", () => {
    expect(sniffUpload(bytes("20:15 Tatort\n"), "programm.txt")?.kind).toBe("text");
    expect(sniffUpload(bytes("Zeit;Titel\n"), "liste.CSV")?.mime).toBe("text/csv");
    expect(sniffUpload(bytes("20:15 Tatort\n"), "programm.exe")).toBeNull();
    expect(sniffUpload(bytes("ab", [0], "cd"), "x.txt")).toBeNull();
  });
  it("rejects disguised and dangerous files", () => {
    expect(sniffUpload(bytes("MZ", [0x90, 0]), "foto.jpg")).toBeNull(); // Windows executable
    expect(sniffUpload(bytes("PK", [3, 4]), "scan.pdf")).toBeNull(); // zip / docx
    expect(sniffUpload(bytes("<svg onload=alert(1)>"), "bild.png")).toBeNull();
    expect(sniffUpload(bytes("<html><script>"), "seite.txt")?.kind).toBe("text"); // stored as plain text, never rendered as HTML
  });
});

describe("upload helpers", () => {
  it("sanitizes names", () => {
    expect(sanitizeFilename("../../etc/pass<wd>.pdf")).toBe("pass_wd_.pdf");
    expect(sanitizeFilename("HÖRZU Seite 12.jpg")).toBe("HÖRZU Seite 12.jpg");
  });
  it("checks count and sizes", () => {
    expect(checkUploadSizes([1, 2])).toEqual([]);
    expect(checkUploadSizes([1, 1, 1, 1, 1, 1])).toHaveLength(1);
    expect(checkUploadSizes([11 * 1024 * 1024])).toEqual(["Eine Datei ist größer als 10 MB."]);
    expect(checkUploadSizes([9e6, 9e6, 9e6])).toEqual(["Die Dateien sind zusammen größer als 25 MB."]);
  });
});

describe("checkUploadsBeforeSending", () => {
  it("reports wrong types and sizes with the server's messages", () => {
    expect(checkUploadsBeforeSending([{ name: "tag.jpg", size: 1000 }, { name: "Hörzu 1991.pdf", size: 2000 }])).toEqual([]);
    expect(checkUploadsBeforeSending([{ name: "archiv.zip", size: 10 }])).toEqual([uploadTypeError("archiv.zip")]);
    expect(checkUploadsBeforeSending([{ name: "a.png", size: 11 * 1024 * 1024 }])).toEqual(["Eine Datei ist größer als 10 MB."]);
  });
});
