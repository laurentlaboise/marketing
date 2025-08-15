// js/modules/supabase.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://msivaavxwszurzopourl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaXZhYXZ4d3N6dXJ6b3BvdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNTAzMDAsImV4cCI6MjA2ODgyNjMwMH0.BznUDkfio5o83f7ZsYyTgrN-oa8NkPy5I1Wqiq46x78';

export const supabase = createClient(supabaseUrl, supabaseKey);
