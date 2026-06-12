import { seedDevData } from "../database/seed.js";

const didSeed = await seedDevData({ force: process.argv.includes("--force") });
console.log(didSeed ? "Seed data inserted." : "Seed data already exists.");
