import type { ImageAuditItem, PageContext } from "./messages";

export interface SourceImageSize {
  width: number;
  height: number;
}

export interface CropRegion {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

const minimumCropSize = 16;
const maximumOutputDimension = 768;

export class ImageCropError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImageCropError";
  }
}

export const calculateCropRegion = (
  rect: ImageAuditItem["rect"],
  viewport: PageContext["viewport"],
  source: SourceImageSize,
): CropRegion | null => {
  if (viewport.width <= 0 || viewport.height <= 0 || source.width <= 0 || source.height <= 0) {
    return null;
  }

  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(viewport.width, rect.x + rect.width);
  const bottom = Math.min(viewport.height, rect.y + rect.height);
  const visibleWidth = right - left;
  const visibleHeight = bottom - top;

  if (visibleWidth < minimumCropSize || visibleHeight < minimumCropSize) {
    return null;
  }

  const scaleX = source.width / viewport.width;
  const scaleY = source.height / viewport.height;

  return {
    sourceX: Math.max(0, Math.round(left * scaleX)),
    sourceY: Math.max(0, Math.round(top * scaleY)),
    sourceWidth: Math.max(1, Math.round(visibleWidth * scaleX)),
    sourceHeight: Math.max(1, Math.round(visibleHeight * scaleY)),
  };
};

const loadImage = async (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageCropError("The visible-tab capture could not be decoded."));
    image.src = dataUrl;
  });

export const cropVisibleImage = async (
  screenshotDataUrl: string,
  item: ImageAuditItem,
  viewport: PageContext["viewport"],
): Promise<string> => {
  const screenshot = await loadImage(screenshotDataUrl);
  const region = calculateCropRegion(item.rect, viewport, {
    width: screenshot.naturalWidth,
    height: screenshot.naturalHeight,
  });

  if (!region) {
    throw new ImageCropError("Scroll the image into view, then audit the page again.");
  }

  const outputScale = Math.min(
    1,
    maximumOutputDimension / region.sourceWidth,
    maximumOutputDimension / region.sourceHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.sourceWidth * outputScale));
  canvas.height = Math.max(1, Math.round(region.sourceHeight * outputScale));
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new ImageCropError("The browser could not prepare this image for analysis.");
  }

  context.drawImage(
    screenshot,
    region.sourceX,
    region.sourceY,
    region.sourceWidth,
    region.sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL("image/png");
};
