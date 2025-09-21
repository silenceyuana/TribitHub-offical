const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();
const port = 3000;

const ADMIN_EMAIL = "silenceyuan@gmail.com";
const ADMIN_PASSWORD = "test";


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



app.use(express.static(path.join(__dirname, 'public')));


app.use(session({
    secret: 'a-very-strong-secret-key-that-no-one-can-guess',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));


const db = new sqlite3.Database('./tickets.db', (err) => {
    if (err) { console.error('数据库连接失败:', err.message); } 
    else {
        console.log('成功连接到SQLite数据库.');
        db.run(`CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    }
});


const checkAuth = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
};


app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html')); 
});


app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html')); 
});


app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else {
        res.redirect('/login');
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.redirect('/admin'); }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});


app.post('/api/submit-ticket', (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ success: false, message: '所有字段均为必填项。' });
    }
    const sql = `INSERT INTO tickets (name, email, subject, message) VALUES (?, ?, ?, ?)`;
    db.run(sql, [name, email, subject, message], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '服务器错误，提交失败。' });
        }
        res.json({ success: true, message: '您的工单已成功提交！' });
    });
});


app.get('/api/tickets', checkAuth, (req, res) => {
    const sql = `SELECT * FROM tickets ORDER BY submitted_at DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        res.json({ tickets: rows });
    });
});


app.listen(port, () => {
    console.log(`服务器正在 http://localhost:${port} 上运行`);
});