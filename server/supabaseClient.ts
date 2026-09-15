import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL || "https://emondvehnvkrofvuoafr.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25kdmVobnZrcm9mdnVvYWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODUxMTAsImV4cCI6MjA5NDU2MTExMH0.cp9vxg2lC60d75-mM5VPNPbvzI8gpGhdiCO9x0RCPm0";

export const supabase = createClient(supabaseUrl, supabaseKey);

if (!supabase) {
  logger.warn("Supabase", "SUPABASE_URL or SUPABASE_KEY is missing. Falling back to local storage.");
} else {
  logger.info("Supabase", "Supabase client initialized successfully.");
}
