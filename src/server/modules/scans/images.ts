import sharp from "sharp";
import { MAX_SCAN_IMAGE_BYTES, scanImageTypeSchema } from "@/contracts/scans";

export async function prepareScanImage(
  bytes: Uint8Array,
  declaredType: string,
): Promise<{ dataUrl: string }> {
  const contentType = scanImageTypeSchema.parse(declaredType);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SCAN_IMAGE_BYTES) {
    throw new Error("Each image must be between one byte and 5 MiB.");
  }
  try {
    const image = sharp(Buffer.from(bytes), {
      limitInputPixels: 16000000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    const expectedFormat = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    }[contentType];
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) !== 1) {
      throw new Error("Unsupported image format.");
    }
    const normalized = await image
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "white" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      dataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`,
    };
  } catch {
    throw new Error(
      "Use a valid, still JPEG, PNG, or WebP image of at most 16 megapixels.",
    );
  }
}
