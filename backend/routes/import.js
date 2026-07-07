const express = require("express")
console.log("IMPORT ROUTE LOADED");
const router = express.Router()

router.post("/devices/import", (req, res) => {

    res.json({
        message: "Upload API Ready"
    })

})

module.exports = router
