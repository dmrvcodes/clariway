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

export const readingProfileSchema = z.object({
  textScale: z.union([z.literal(100), z.literal(125), z.literal(150)]),
  highContrast: z.boolean(),
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

const applyImageAltRequestSchema = z.object({
  type: z.literal("APPLY_IMAGE_ALT"),
  imageId: z.string().regex(/^image-\d+$/u),
  expectedSource: z.string().min(1),
  altText: z.string().trim().min(1).max(500),
});

const restoreImageAltRequestSchema = z.object({
  type: z.literal("RESTORE_IMAGE_ALT"),
  imageId: z.string().regex(/^image-\d+$/u),
  expectedSource: z.string().min(1),
});

export type PageContext = z.infer<typeof pageContextSchema>;
export type ImageAuditItem = z.infer<typeof imageAuditItemSchema>;
export type MediaAuditItem = z.infer<typeof mediaAuditItemSchema>;
export type MediaTextTrack = z.infer<typeof mediaTextTrackSchema>;
export type ReadingProfile = z.infer<typeof readingProfileSchema>;

export interface VisibleTabCapture {
  kind: "visible-tab-capture";
  dataUrl: string;
}

export const extensionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_ACTIVE_PAGE_CONTEXT") }),
  z.object({ type: z.literal("CAPTURE_VISIBLE_TAB") }),
  applyImageAltRequestSchema,
  restoreImageAltRequestSchema,
  z.object({ type: z.literal("APPLY_READING_PROFILE") }).merge(readingProfileSchema),
  z.object({ type: z.literal("RESET_READING_PROFILE") }),
  z.object({ type: z.literal("OPEN_SIDE_PANEL") }),
]);

export type ExtensionRequest = z.infer<typeof extensionRequestSchema>;

export const contentRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_PAGE_CONTEXT") }),
  applyImageAltRequestSchema,
  restoreImageAltRequestSchema,
  z.object({ type: z.literal("APPLY_READING_PROFILE") }).merge(readingProfileSchema),
  z.object({ type: z.literal("RESET_READING_PROFILE") }),
]);

export type ContentRequest = z.infer<typeof contentRequestSchema>;

export type ExtensionResponse =
  | { ok: true; data: PageContext }
  | { ok: true; data: VisibleTabCapture }
  | { ok: true; data: ReadingProfile }
  | { ok: true }
  | { ok: false; error: string };
