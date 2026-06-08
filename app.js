console.log("SERVER FILE LOADED ✔");
if(process.env.NODE_ENV != "production"){
   require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");


//Config
//const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

const db = process.env.ATLASDB_URL;
console.log("DB URL =", process.env.ATLASDB_URL);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


const store = MongoStore.create({
  mongoUrl: db,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error", ()=>{
  console.log("error in MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: "process.env.SECRET",
  resave: false,
  saveUninitialized: false, // better practice
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};


app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// HOME ROUTE

app.get("/", (req, res) => {

  res.redirect("/listings");

});


 //app.get("/demouser", async (req,res)=>{
//   let fakeUser = new User({
//     email: "student@gmail.com",
//     username: 'delta-student'
//   });

//   let registeredUser = await User.register(fakeUser, "helloworld");
//   res.send(registeredUser);
// })

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

//DB
async function main() {
  await mongoose.connect(db);
}
main()
  .then(() => console.log("Connected to DB"))
  .catch((err) => console.log(err));

// ✅ SESSION TEST ROUTE (ADD THIS)
app.get("/session-test", (req, res) => {
  req.session.user = "Rehan"; // creates session
  res.send("Session created!");
});

// ✅ CHECK SESSION ROUTE (ADD THIS)
app.get("/check-session", (req, res) => {
  res.send(req.session.user || "No session found");
});

app.post("/test", (req, res) => {
  console.log(req.body);
  res.send("check terminal");
});

// 404
app.use((req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});

// Error handler
app.use((err, req, res, next) => {
  console.log(err);
  const { statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error.ejs", { message });
});

// Server
app.listen(8080, () => {
  console.log("Server running on port 8080");
});