import "server-only";
import type { ScanKind } from "@/contracts/scans";
import { createVisionAnalyzer } from "./vision-client";

function scanProviderConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.SCAN_VISION_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error(
      "Photo recognition is not configured. Contact the app owner or add items manually.",
    );
  }
  return { apiKey, model };
}

export function assertScanProviderConfigured(): void {
  scanProviderConfig();
}

export async function analyzeGroceryImages(images: string[], kind: ScanKind) {
  return createVisionAnalyzer(scanProviderConfig())(images, kind);
}
