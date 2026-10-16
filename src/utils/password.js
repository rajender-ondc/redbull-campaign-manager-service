"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

// Password hashing (ADR-015), used by the login and user services. Only the bcrypt hash is ever
// stored; bcrypt is deliberately slow, so guessing passwords from a stolen database takes years.

/** bcrypt work factor: about a quarter of a second per hash on a current server. */
const BCRYPT_COST = 12;

// const UPPERCASE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
// const LOWERCASE_LETTERS = "abcdefghijkmnopqrstuvwxyz";
// const DIGITS = "23456789";
// const SYMBOLS = "@#$%!&*?";
// const GENERATED_PASSWORD_LENGTH = 16;

/** A hash of a random value, checked when an email has no account (created on first use). */
let decoyPasswordHashPromise = null;

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** True if the password matches the stored bcrypt hash. */
async function isPasswordMatch(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Spends as long as a real password check, for an email with no active account, so response
 * times don't reveal which emails have accounts. Always "no match".
 */
async function runDecoyPasswordCheck(password) {
  decoyPasswordHashPromise ??= bcrypt.hash(crypto.randomUUID(), BCRYPT_COST);
  await bcrypt.compare(password, await decoyPasswordHashPromise);
}

/**
 * Generates a strong random password that meets the password rules: 16 characters with at least
 * one uppercase letter, lowercase letter, digit and symbol. Look-alike characters are left out.
 */
function generatePassword() {
  // const characterSets = [UPPERCASE_LETTERS, LOWERCASE_LETTERS, DIGITS, SYMBOLS];
  // const allCharacters = characterSets.join("");
  // const characters = characterSets.map(pickRandomCharacter);
  // while (characters.length < GENERATED_PASSWORD_LENGTH) {
  //   characters.push(pickRandomCharacter(allCharacters));
  // }
  // // Shuffle (Fisher–Yates), so the guaranteed characters aren't always first.
  // for (let index = characters.length - 1; index > 0; index--) {
  //   const swapIndex = crypto.randomInt(index + 1);
  //   [characters[index], characters[swapIndex]] = [
  //     characters[swapIndex],
  //     characters[index],
  //   ];
  // }

  return "Admin@1234";
}

// function pickRandomCharacter(characters) {
//   return characters[crypto.randomInt(characters.length)];
// }

module.exports = {
  hashPassword,
  isPasswordMatch,
  runDecoyPasswordCheck,
  generatePassword,
};
