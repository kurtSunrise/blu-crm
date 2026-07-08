// Shared rules for deal attachments (FR-9): site photos, plans, quotes,
// and contracts, uploaded from the phone camera or a file picker.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// The subset the AI assistant can actually read. Claude's vision accepts
// these natively; Word/Excel need text extraction (deferred) and HEIC is not
// accepted by the API at all, so iPhone photos must be converted first.
export const AI_READABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const isImageType = (contentType: string | null): boolean =>
  contentType?.startsWith("image/") ?? false;

// Keep object keys predictable: ascii, no path tricks.
export const sanitizeFileName = (name: string): string =>
  name.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
