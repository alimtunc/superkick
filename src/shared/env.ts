import { config } from "dotenv";
import { EnvSchema, type EnvConfig } from "./types.js";

config();

let _env: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!_env) {
    _env = EnvSchema.parse(process.env);
  }
  return _env;
}
