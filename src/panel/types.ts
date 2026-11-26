import type { ImageAuditItem } from "../core/messages";
import type { ImageDescriptionInput } from "../core/alt-text";
import type { ImageDescriptionResult } from "../firebase/ai";
import type { CloudConsentReason } from "../core/hybrid-routing";

export interface CloudRequest {
  reason: CloudConsentReason;
  detail: string;
}

export interface DescriptionEntry {
  /** Exact crop and bounded context used to render the cloud review card. */
  input: ImageDescriptionInput;
  result: ImageDescriptionResult | null;
  applied: boolean;
  cloudRequest: CloudRequest | null;
}

export type DescriptionEntries = Record<ImageAuditItem["id"], DescriptionEntry>;

export interface RoutingActivity {
  onDeviceResults: number;
  approvedCloudSends: number;
}
