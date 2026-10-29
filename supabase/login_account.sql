-- =====================================================================
-- DEFAULT LOGIN  (run once in Supabase > SQL Editor, AFTER migrations 0001-0009)
-- Creates the GM Commercial account shown under the sign-in box:
--     Login ID : admin@ikgpl.net
--     Password : Ikgpl@2026
-- Running it again resets that password. To change the password, edit
-- v_pass below AND the text in src/pages/Login.tsx (DEFAULT_LOGIN).
-- =====================================================================
do $$
declare
  v_email text := 'admin@ikgpl.net';
  v_pass  text := 'Ikgpl@2026';
  v_id    uuid;
begin
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_pass, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"full_name":"GM Commercial"}', now(), now(),
            '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users
       set encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
  end if;

  -- the sign-up trigger normally creates the profile; make sure it is an active GM
  alter table public.profiles disable trigger profiles_guard;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_id, v_email, 'GM Commercial', 'gm_commercial', true)
  on conflict (id) do update set role = 'gm_commercial', is_active = true;
  alter table public.profiles enable trigger profiles_guard;
end $$;
