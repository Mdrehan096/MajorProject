const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl, validateSignup } = require("../middleware.js");

const userController = require("../controllers/users.js");

router
  .route("/signup")
  .get(userController.renderSignupForm)
  .post(validateSignup, wrapAsync(userController.signup));

router
  .route("/login")
  .get(userController.renderLoginForm)
  .post(
    (req, res, next) => {
      if (
        typeof req.body?.username !== "string" ||
        typeof req.body?.password !== "string"
      ) {
        req.flash("error", "Invalid username or password format.");
        return res.redirect("/login");
      }
      next();
    },
    saveRedirectUrl,
    passport.authenticate("local", {
      failureRedirect: "/login",
      failureFlash: true,
    }),
    userController.login
  );

router.post("/logout", userController.logout);

module.exports = router;
