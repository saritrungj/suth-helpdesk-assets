const express = require("express");
const multer = require("multer");
const router = express.Router();

const importController = require("../controllers/importController");

const upload = multer({
  dest: "uploads/"
});


router.post(
  "/devices/import",
  upload.single("file"),
  importController.importDevices
);


module.exports = router;