import { readConfig } from "../lib/config";

try {
  try { process.loadEnvFile(".env.local"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  readConfig();
  console.log("Demo configuration is present. Live credentials are checked by Clerk and Arcade when used.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid demo configuration.");
  process.exitCode = 1;
}
