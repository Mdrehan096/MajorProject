const ExpressError = require("../utils/ExpressError.js");
const userService = require("../services/userService.js");

function getExpectedSignupErrorMessage(err) {
  if (err instanceof ExpressError && err.statusCode >= 400 && err.statusCode < 500) {
    return err.message;
  }
  if (
    err?.name === "UserExistsError" ||
    err?.name === "MissingUsernameError" ||
    err?.name === "MissingPasswordError"
  ) {
    return err.message;
  }
  if (err?.code === 11000 || err?.cause?.code === 11000) {
    return "A user with the given username is already registered";
  }
  if (err?.name === "ValidationError") {
    return "Invalid signup details. Please check your input.";
  }
  return null;
}

module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
  let registeredUser;
  try {
    const { username, email, password } = req.body || {};
    registeredUser = await userService.registerUser({
      username,
      email,
      password,
    });
  } catch (e) {
    const expectedMessage = getExpectedSignupErrorMessage(e);
    if (expectedMessage) {
      req.flash("error", expectedMessage);
      return res.redirect("/signup");
    }
    return next(e);
  }

  req.login(registeredUser, (err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "welcome to wanderlust");
    res.redirect("/listings");
  });
};

module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
  req.flash("success", "welcome back to wanderlust");
  const rawRedirect = res.locals.redirectUrl;
  const redirectUrl =
    typeof rawRedirect === "string" &&
      rawRedirect.startsWith("/") &&
      !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/listings";
  res.redirect(redirectUrl);
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "you are logged out");
    res.redirect("/listings");
  });
};

module.exports.renderProfile = async (req, res) => {
  const profileData = await userService.getUserProfile(req.user?._id);
  if (!profileData) {
    req.flash("error", "User account could not be found.");
    return res.redirect("/listings");
  }

  res.render("users/profile.ejs", profileData);
};

module.exports.updateProfile = async (req, res, next) => {
  try {
    const updated = await userService.updateUserProfile(req.user?._id, req.body);
    if (!updated) {
      req.flash("error", "User account could not be found.");
      return res.redirect("/listings");
    }
    req.flash("success", "Profile updated successfully.");
    return res.redirect("/profile");
  } catch (err) {
    if (err instanceof ExpressError && err.statusCode >= 400 && err.statusCode < 500) {
      req.flash("error", err.message);
      return res.redirect("/profile");
    }
    if (err?.code === 11000 || err?.cause?.code === 11000) {
      req.flash("error", "Unable to update email with a duplicate value.");
      return res.redirect("/profile");
    }
    return next(err);
  }
};

module.exports.renderDashboard = async (req, res) => {
  const dashboardData = await userService.getUserDashboard(req.user?._id);
  if (!dashboardData) {
    req.flash("error", "User account could not be found.");
    return res.redirect("/listings");
  }

  res.render("users/dashboard.ejs", dashboardData);
};
