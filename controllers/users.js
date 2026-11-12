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
