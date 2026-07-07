const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();


router.post("/login", async (req, res) => {

    console.log("➡️ Login request received");


    const { username, password } = req.body || {};


    console.log("Username:", username);


    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }


    try {

        console.log("➡️ Query database");


        const [users] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );


        console.log("Database result:", users);


        if (users.length === 0) {
            return res.status(401).json({
                message: "User not found"
            });
        }


        const user = users[0];


        console.log("➡️ Check password");


        const match = await bcrypt.compare(
            password,
            user.password
        );


        console.log("Password match:", match);


        if (!match) {
            return res.status(401).json({
                message: "Password incorrect"
            });
        }


        console.log("➡️ Create JWT token");


        const token = jwt.sign(
            {
                id: user.id,
                sername: user.username,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn:"8h"
            }
        );


        console.log("✅ Login success");


        return res.json({
            message: "Login success",
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            },
            token: token
        });


    } catch (error) {

        console.error("❌ Login error:", error);


        return res.status(500).json({
            message: "Server error",
            error: error.message
        });

    }

});


module.exports = router;