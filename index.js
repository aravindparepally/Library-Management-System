const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const session = require("express-session");



// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: "your-secret-key", // Change this to a secure value
    resave: false,
    saveUninitialized: true
}));

// Set EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files (CSS, JS, images)
app.use(express.static("public"));

// MySQL Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "project"
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to MySQL database.");
});
app.get('/profile', (req, res) => {
    const userId = req.session.user_id;
  
    if (!userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }
  
    const query = 'SELECT user_id, username, email FROM users WHERE user_id = ?';
    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
  
      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const user = results[0];
      res.json(user);
    });
  });
  
// Search Books (with pagination)
app.get("/search", (req, res) => {
    const searchQuery = req.query.q || "";
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 50;

    const sqlQuery = `
        SELECT * FROM books 
        WHERE title LIKE ? OR author LIKE ? OR publisher LIKE ?
        LIMIT ? OFFSET ?
    `;

    db.query(
        sqlQuery,
        [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, limit, offset],
        (err, results) => {
            if (err) {
                console.error("Database search error:", err);
                return res.json({ success: false, error: "Database error" });
            }

            const hasMore = results.length === limit;

            res.json({ success: true, books: results, hasMore });
        }
    );
});

// View Issued Books Page
app.get("/issued_books", (req, res) => {
    const { user_id, username } = req.query;

    if (!user_id || !username) {
        console.log("Missing user_id or username. Redirecting to login.");
        return res.redirect("/login");
    }

    // Format date to DD-MM-YYYY
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // First, get all books issued to this user from issued_books table
    const issuedQuery = `
        SELECT book_id, issue_date, due_date 
        FROM issued_books 
        WHERE user_id = ?
    `;

    db.query(issuedQuery, [user_id], (err, issuedRows) => {
        if (err) {
            console.error("Error fetching issued books:", err);
            return res.status(500).send("Internal Server Error");
        }

        if (issuedRows.length === 0) {
            return res.render("issued_books", { issuedBooks: [], user_id, username });
        }

        const bookIds = issuedRows.map(row => row.book_id);
        const placeholders = bookIds.map(() => "?").join(", ");

        const booksQuery = `
            SELECT * FROM books 
            WHERE book_id IN (${placeholders})
        `;

        db.query(booksQuery, bookIds, (err, bookDetails) => {
            if (err) {
                console.error("Error fetching book details:", err);
                return res.status(500).send("Internal Server Error");
            }

            // Merge book info with issue/due dates and format them
            const issuedBooks = bookDetails.map(book => {
                const match = issuedRows.find(row => row.book_id == book.book_id);
                return {
                    ...book,
                    issue_date: match ? formatDate(match.issue_date) : null,
                    due_date: match ? formatDate(match.due_date) : null
                };
            });

            res.render("issued_books", {
                issuedBooks,
                user_id,
                username
            });
        });
    });
});



// Return Books Page
app.get("/return", (req, res) => {
    res.render("return");
});

// Render Home Page
app.get("/", (req, res) => {
    console.log("Rendering Home Page");
    res.render("index");
});

// Render Signup Page
app.get("/signup", (req, res) => {
    console.log("Rendering Signup Page");
    res.render("signup", { message: null });
});

// Render Login Page
app.get("/login", (req, res) => {
    console.log("Rendering Login Page");
    res.render("login", { message: null });
});

// Render Dashboard Page
app.get("/dashboard", (req, res) => {
    console.log("Attempting to render Dashboard");

    const username = req.query.username;
    const user_id = req.query.user_id;
    
    
    if (!username || !user_id) {
        console.log("Missing username or user_id. Redirecting to login.");
        return res.redirect("/login");
    }
    

    console.log("Rendering Dashboard for user: " + username);
    res.render("dashboard", {
        username,
        user_id
    });
});

// Browse and Search Books Page (with dynamic user info)
app.get("/browse", (req, res) => {
    const username = req.query.username;
    const user_id = req.query.user_id;

    if (!username || !user_id) {
        console.log("Missing username or user_id. Redirecting to login.");
        return res.redirect("/login");
    }

    console.log("Rendering Browse page for user: " + username);
    res.render('browse', { 
        username,
        user_id
    });
});

// Handle Signup
app.post("/signup", (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    console.log("Signup Request - Username: " + username + ", Email: " + email);

    if (!username || !email || !password || !confirmPassword) {
        console.log("Signup failed: Missing fields");
        return res.render("signup", { message: "All fields are required." });
    }

    if (password !== confirmPassword) {
        console.log("Signup failed: Passwords do not match");
        return res.render("signup", { message: "Passwords do not match." });
    }

    const checkUserQuery = "SELECT * FROM users WHERE username = ?";
    db.query(checkUserQuery, [username], (err, result) => {
        if (err) {
            console.error("Database error while checking user:", err);
            return res.render("signup", { message: "Database error." });
        }

        if (result.length > 0) {
            console.log("Signup failed: Username already exists");
            return res.render("signup", { message: "Username already exists." });
        }

        const insertQuery = "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
        db.query(insertQuery, [username, email, password], (err) => {
            if (err) {
                console.error("Signup failed:", err);
                return res.render("signup", { message: "Signup failed." });
            }

            console.log("Signup successful for user: " + username);
            res.redirect("/login");
        });
    });
});

// Handle Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    console.log("Login Request - Username: " + username);

    if (!username || !password) {
        console.log("Login failed: Missing fields");
        return res.render("login", { message: "All fields are required." });
    }

    const query = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.query(query, [username, password], (err, result) => {
        if (err) {
            console.error("Database error while checking login:", err);
            return res.render("login", { message: "Database error." });
        }

        if (result.length > 0) {
            console.log("Login successful for user: " + username);
            const user_id = result[0].user_id;
            console.log("User ID: " + user_id);
            req.session.user_id = user_id;
            req.session.username = username;

    res.redirect(`/dashboard?username=${username}&user_id=${user_id}`);

        } else {
            console.log("Login failed: Invalid credentials");
            res.render("login", { message: "Invalid credentials." });
        }
    });
});


// Manual Book Issue Form Handling
app.post("/issue", (req, res) => {
    const { username, user_id, book_id, book_name, issue_date, due_date } = req.body;

    if (!username || !user_id || !book_id || !book_name || !issue_date || !due_date) {
        console.log("Issue failed: Missing fields");
        return res.render("issue", { message: "All fields are required." });
    }

    const checkBookQuery = "SELECT * FROM books WHERE book_id = ? AND title = ?";
    db.query(checkBookQuery, [book_id, book_name], (err, bookResult) => {
        if (err || bookResult.length === 0) {
            console.log("Book not found or DB error");
            return res.render("issue", { message: "Book not found." });
        }

        const issueQuery = `
            INSERT INTO issued_books (user_id, username, book_id, book_name, issue_date, due_date)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(issueQuery, [user_id, username, book_id, book_name, issue_date, due_date], (err, result) => {
            if (err) {
                console.error("Error issuing book:", err);
                return res.render("issue", { message: "Failed to issue book." });
            }

            const issuedId = result.insertId;
            console.log(`Issued book record created with ID: ${issuedId}`);
            res.render("issue", { message: `Book issued successfully! Issue ID: ${issuedId}` });
        });
    });
});

// Borrow via Browse Button (auto-calculates return date)
app.post("/borrow", (req, res) => {
    const { user_id, username, book_id, book_name } = req.body;

    const issue_date = new Date();
    const due_date = new Date();
    due_date.setMonth(issue_date.getMonth() + 1); // +1 month

    const insertQuery = `
        INSERT INTO issued_books (user_id, username, book_id, book_name, issue_date, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(insertQuery, [
        user_id,
        username,
        book_id,
        book_name,
        issue_date.toISOString().split("T")[0],
        due_date.toISOString().split("T")[0]
    ], (err, result) => {

        if (err) {
            console.error("Error borrowing book:", err);
            return res.status(500).send("Failed to borrow book.");
        }

        console.log(`Book "${book_name}" issued to ${username}`);
        // Redirect to the issued-books page with username and user_id
        res.redirect(`/issued_books?username=${username}&user_id=${user_id}`);
    });
});
// Return a Book (POST)
app.post("/return", (req, res) => {
    const { user_id, username, book_id } = req.body;

    if (!user_id || !username || !book_id) {
        console.log("Return failed: Missing required fields");
        return res.status(400).send("Missing data.");
    }

    const deleteQuery = `
        DELETE FROM issued_books 
        WHERE user_id = ? AND book_id = ?
    `;

    db.query(deleteQuery, [user_id, book_id], (err, result) => {
        if (err) {
            console.error("Error returning book:", err);
            return res.status(500).send("Failed to return book.");
        }

        console.log(`Book with ID ${book_id} returned by user ${username}`);
        res.redirect(`/issued_books?username=${username}&user_id=${user_id}`);
    });
});



// Start Server
const PORT = 8080;
app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});
