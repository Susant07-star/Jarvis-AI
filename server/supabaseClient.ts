import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabase) {
  logger.warn("Supabase", "SUPABASE_URL or SUPABASE_KEY is missing. Falling back to local storage.");
} else {
  logger.info("Supabase", "Supabase client initialized successfully.");
}
