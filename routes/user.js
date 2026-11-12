const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const {
  isLoggedIn,
  saveRedirectUrl,
  validateSignup,
  validateLogin,
  validateProfileUpdate,
} = require("../middleware");

const userController = require("../controllers/users.js");

router
  .route("/signup")
  .get(userController.renderSignupForm)
  .post(validateSignup, wrapAsync(userController.signup));

router
  .route("/login")
  .get(userController.renderLoginForm)
  .post(
    validateLogin,
    saveRedirectUrl,
    passport.authenticate("local", {
      failureRedirect: "/login",
      failureFlash: true,
    }),
    userController.login
  );

router.post("/logout", userController.logout);

router
  .route("/profile")
  .get(isLoggedIn, wrapAsync(userController.renderProfile))
  .put(isLoggedIn, validateProfileUpdate, wrapAsync(userController.updateProfile));

router.get("/dashboard", isLoggedIn, wrapAsync(userController.renderDashboard));

module.exports = router;
