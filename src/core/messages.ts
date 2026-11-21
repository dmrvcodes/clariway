import { z } from "zod";

export const imageAuditItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  alt: z.string(),
  state: z.enum(["described", "missing", "ignored"]),
  nearbyText: z.string(),
  isInteractive: z.boolean(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
});

export const imageAuditSchema = z.object({
  total: z.number().int().nonnegative(),
  audited: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  items: z.array(imageAuditItemSchema),
});

export const mediaTextTrackSchema = z.object({
  kind: z.enum(["captions", "subtitles", "descriptions", "chapters", "metadata"]),
  label: z.string(),
  language: z.string(),
  mode: z.enum(["disabled", "hidden", "showing", "unknown"]),
  cueCount: z.number().int().nonnegative(),
});

export const mediaAuditItemSchema = z.object({
  id: z.string(),
  element: z.enum(["audio", "video"]),
  source: z.string(),
  title: z.string(),
  state: z.enum(["captioned", "transcript", "missing"]),
  duration: z.number().nonnegative().nullable(),
  nearbyText: z.string(),
  transcript: z.string(),
  hasTranscriptLink: z.boolean(),
  tracks: z.array(mediaTextTrackSchema),
});

export const mediaAuditSchema = z.object({
  total: z.number().int().nonnegative(),
  audited: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  withTextAlternative: z.number().int().nonnegative(),
  items: z.array(mediaAuditItemSchema),
});

export const pageContextSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
  mainText: z.string(),
  selectedText: z.string(),
  capturedAt: z.number().int().positive(),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  imageAudit: imageAuditSchema,
  mediaAudit: mediaAuditSchema,
});

export const imageAltMutationSchema = z.object({
  imageId: z.string().regex(/^image-\d+$/u),
  expectedSource: z.string().min(1),
  altText: z.string().trim().min(1).max(500).optional(),
});

export type PageContext = z.infer<typeof pageContextSchema>;
export type ImageAuditItem = z.infer<typeof imageAuditItemSchema>;
export type MediaAuditItem = z.infer<typeof mediaAuditItemSchema>;
export type MediaTextTrack = z.infer<typeof mediaTextTrackSchema>;
export type ImageAltMutation = z.infer<typeof imageAltMutationSchema>;

export interface VisibleTabCapture {
  kind: "visible-tab-capture";
  dataUrl: string;
}

export type ExtensionRequest =
  | { type: "GET_PAGE_CONTEXT" }
  | { type: "GET_ACTIVE_PAGE_CONTEXT" }
  | { type: "CAPTURE_VISIBLE_TAB" }
  | ({ type: "APPLY_IMAGE_ALT" } & ImageAltMutation)
  | ({ type: "RESTORE_IMAGE_ALT" } & Omit<ImageAltMutation, "altText">)
  | { type: "OPEN_SIDE_PANEL" };

export type ExtensionResponse =
  | { ok: true; data: PageContext }
  | { ok: true; data: VisibleTabCapture }
  | { ok: true }
  | { ok: false; error: string };
