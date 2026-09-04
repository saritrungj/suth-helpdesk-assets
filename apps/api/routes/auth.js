const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../db");

const router = express.Router();

// กัน brute force เดารหัสผ่าน — จำกัดไว้ 10 ครั้ง/15 นาที ต่อ IP
// (นับเฉพาะ request ที่ตอบกลับด้วย error 4xx/5xx ไม่นับ login สำเร็จ)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        message: "Too many login attempts, please try again later",
        error: "Too many login attempts, please try again later"
    }
});

router.post("/login", loginLimiter, async (req, res) => {

    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required",
            error: "Username and password are required"
        });
    }

    try {

        const [users] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        // ใช้ข้อความ error เดียวกันไม่ว่า username จะไม่มีอยู่จริง หรือ password ผิด
        // เพื่อกัน user enumeration (ไม่ให้คนร้ายเดาได้ว่า username ไหนมีอยู่ในระบบ)
        const INVALID_CREDENTIALS = {
            message: "Invalid username or password",
            error: "Invalid username or password"
        };

        if (users.length === 0) {
            return res.status(401).json(INVALID_CREDENTIALS);
        }

        const user = users[0];

        const match = await bcrypt.compare(
            password,
            user.password
        );

        if (!match) {
            return res.status(401).json(INVALID_CREDENTIALS);
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

        console.error("Login error:", error);

        return res.status(500).json({
            message: "Server error",
            error: error.message
        });

    }

});


module.exports = router;