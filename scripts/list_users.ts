import { supabase } from '../src/core/auth/supabaseClient';

async function listUsers() {
  console.log('=== LISTING PROFILES IN SUPABASE ===');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, nik, name, department, role, password');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log(`Found ${profiles?.length || 0} user profiles in Supabase:`);
  profiles?.forEach((p) => {
    console.log(`- NIK: ${p.nik} | Name: ${p.name} | Dept: ${p.department} | Role: ${p.role} | Password: ${p.password || '(default: laras123)'}`);
  });
}

listUsers().catch(console.error);
