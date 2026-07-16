const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }

    try {
        const [users] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        // ตอบข้อความเดียวกันทั้งกรณี user ไม่มีและรหัสผิด กัน username enumeration
        if (users.length === 0) {
            return res.status(401).json({
                message: "Username หรือรหัสผ่านไม่ถูกต้อง"
            });
        }

        const user = users[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({
                message: "Username หรือรหัสผ่านไม่ถูกต้อง"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h",
            }
        );

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
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Server error"
        });
    }
});

module.exports = router;
