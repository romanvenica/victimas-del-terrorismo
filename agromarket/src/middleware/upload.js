const multer = require('multer');
const config = require('../config');
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxMb * 1024 * 1024, files: config.uploads.maxFotos },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.mimetype)),
});
