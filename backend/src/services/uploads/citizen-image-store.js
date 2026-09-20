import { mkdirSync } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { ValidationError } from '../../errors/application-error.js';

const uploadDirectory = fileURLToPath(new URL('../../../uploads/citizen/', import.meta.url));
const extensionByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const maxBytes = 4 * 1024 * 1024;

mkdirSync(uploadDirectory, { recursive: true });

function uploadError(error) {
  if (!error) return null;
  const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 4 MB or smaller' : 'Invalid image upload';
  return new ValidationError(message, [{ path: 'image', message }]);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename(_request, file, done) {
      done(null, `${randomUUID()}${extensionByMime[file.mimetype] ?? ''}`);
    },
  }),
  limits: { fileSize: maxBytes, files: 1, fields: 8 },
  fileFilter(_request, file, done) {
    if (extensionByMime[file.mimetype]) done(null, true);
    else done(new Error('UNSUPPORTED_IMAGE_TYPE'));
  },
});

function safePath(storageKey) {
  if (!storageKey || basename(storageKey) !== storageKey) throw new ValidationError('Invalid image reference');
  return join(uploadDirectory, storageKey);
}

function detectedMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function citizenImageUpload(request, response, next) {
  upload.single('image')(request, response, (error) => next(uploadError(error)));
}

export const citizenImageStore = {
  async descriptor(file) {
    if (!file) return null;
    const handle = await open(file.path, 'r');
    const bytes = Buffer.alloc(12);
    try { await handle.read(bytes, 0, bytes.length, 0); } finally { await handle.close(); }
    const mimeType = detectedMime(bytes);
    if (!mimeType || mimeType !== file.mimetype) {
      await unlink(file.path).catch(() => {});
      throw new ValidationError('Image content does not match an allowed JPEG, PNG, or WEBP format', [{ path: 'image', message: 'Unsupported image content' }]);
    }
    return { storageKey: file.filename, mimeType, size: file.size };
  },

  async read(descriptor) {
    if (!descriptor?.storageKey || !extensionByMime[descriptor.mimeType]) return null;
    return { mimeType: descriptor.mimeType, data: (await readFile(safePath(descriptor.storageKey))).toString('base64') };
  },

  async remove(descriptor) {
    if (!descriptor?.storageKey) return;
    await unlink(safePath(descriptor.storageKey)).catch(() => {});
  },
};
