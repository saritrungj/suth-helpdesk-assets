const express = require("express");
const multer = require("multer");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const importController = require("../controllers/importController");

const upload = multer({
  dest: "uploads/"
});


// ต้อง login และเป็น admin ถึงจะ import ได้ (เดิมไม่มีการป้องกันเลย)
router.post(
  "/devices/import",
  authMiddleware,
  adminMiddleware,
  upload.single("file"),
  importController.importDevices
);


module.exports = router;