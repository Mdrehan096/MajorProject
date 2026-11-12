const mongoose = require("mongoose");
const User = require("../models/user");
const ExpressError = require("../utils/ExpressError.js");

const ALLOWED_REGISTER_FIELDS = new Set(["username", "email", "password"]);
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStrictObjectId(id) {
  if (typeof id === "string") {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
  return (
    Boolean(id) &&
    typeof id === "object" &&
    (id instanceof mongoose.Types.ObjectId || id._bsontype === "ObjectId") &&
    mongoose.Types.ObjectId.isValid(id)
  );
}

async function registerUser(payload) {
  if (!isPlainObject(payload)) {
    throw new ExpressError(400, "Username, email, and password are required.");
  }

  const unexpectedKeys = Object.keys(payload).filter(
    (key) => !ALLOWED_REGISTER_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in signup payload: ${unexpectedKeys.join(", ")}`
    );
  }

  const { username, email, password } = payload;
  if (
    typeof username !== "string" ||
    !username.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    throw new ExpressError(400, "Username, email, and password are required.");
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();
  if (!BASIC_EMAIL_REGEX.test(trimmedEmail)) {
    throw new ExpressError(400, "Please provide a valid email address.");
  }

  const newUser = new User({
    username: trimmedUsername,
    email: trimmedEmail,
  });

  return User.register(newUser, password);
}

async function findUserById(userId) {
  if (!isStrictObjectId(userId)) {
    throw new ExpressError(400, "Invalid User ID");
  }

  return User.findById(userId).select("-hash -salt");
}

async function findUserByUsername(username) {
  if (typeof username !== "string" || !username.trim()) {
    throw new ExpressError(400, "Username must be a non-empty string.");
  }

  return User.findOne({ username: username.trim() }).select("-hash -salt");
}

module.exports = {
  registerUser,
  findUserById,
  findUserByUsername,
};
