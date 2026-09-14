import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://utvzubstnocxnztrrzqs.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0dnp1YnN0bm9jeG56dHJyenFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTAzMDYsImV4cCI6MjA5NDM4NjMwNn0.mkRaGCJr9iAAae9En5p7q74guuIdK7KTJcKX1h7yrqQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
