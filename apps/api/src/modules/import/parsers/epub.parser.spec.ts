import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpub } from "./epub.parser";

const buildMinimalEpub = async (): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0"?>
     <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
       <rootfiles>
         <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
       </rootfiles>
     </container>`,
  );
  zip.folder("OEBPS")?.file(
    "content.opf",
    `<?xml version="1.0"?>
     <package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
       <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
         <dc:title>Test Novel</dc:title>
         <dc:identifier id="uid">test-epub</dc:identifier>
       </metadata>
       <manifest>
         <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
         <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
       </manifest>
       <spine>
         <itemref idref="c1"/>
         <itemref idref="c2"/>
       </spine>
     </package>`,
  );
  zip.folder("OEBPS")?.file(
    "ch1.xhtml",
    `<?xml version="1.0"?>
     <html xmlns="http://www.w3.org/1999/xhtml">
       <head><title>Chương 1</title></head>
       <body><h1>Chương 1</h1><p>First chapter body.</p></body>
     </html>`,
  );
  zip.folder("OEBPS")?.file(
    "ch2.xhtml",
    `<?xml version="1.0"?>
     <html xmlns="http://www.w3.org/1999/xhtml">
       <head><title>Chương 2</title></head>
       <body><h1>Chương 2</h1><p>Second chapter body.</p></body>
     </html>`,
  );

  return zip.generateAsync({ type: "nodebuffer" });
};

describe("parseEpub", () => {
  it("parses epub spine into chapters", async () => {
    const buffer = await buildMinimalEpub();
    const chapters = await parseEpub(buffer);
    expect(chapters).toHaveLength(2);
  });

  it("extracts title and text from each spine item", async () => {
    const buffer = await buildMinimalEpub();
    const chapters = await parseEpub(buffer);
    expect(chapters[0]).toMatchObject({
      number: 1,
      title: "Chương 1",
    });
    expect(chapters[0]?.text).toContain("First chapter body");
    expect(chapters[1]).toMatchObject({
      number: 2,
      title: "Chương 2",
    });
    expect(chapters[1]?.text).toContain("Second chapter body");
  });
});
