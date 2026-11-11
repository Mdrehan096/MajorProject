const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("../models/user.js");

function configurePassport(app) {
  passport.use(new LocalStrategy(User.authenticate()));
  passport.serializeUser(User.serializeUser());
  passport.deserializeUser(User.deserializeUser());

  if (app && typeof app.use === "function") {
    app.use(passport.initialize());
    app.use(passport.session());
  }

  return passport;
}

module.exports = {
  passport,
  configurePassport,
};

