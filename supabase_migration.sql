-- ==============================================================================
-- MIGRATION CORRETIVA: RECONHECIMENTO FACIAL SEGURO (PROJETO ESCOLAR)
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/pfhcefsacnmkwmhghazb/sql
-- ==============================================================================

-- 1. Garantir que as colunas biométricas existam na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS average_descriptor jsonb,
  ADD COLUMN IF NOT EXISTS samples jsonb,
  ADD COLUMN IF NOT EXISTS liveness_verified boolean DEFAULT true;

-- 2. CORREÇÃO 1: Definir o padrão de role como 'user' (sem privilégios admin automáticos)
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'user';

-- 3. CORREÇÃO 3: Assegurar as chaves estrangeiras com auth.users (sem removê-las)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'face_registrations_user_id_fkey') THEN
    ALTER TABLE public.face_registrations
      ADD CONSTRAINT face_registrations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Limpeza de políticas antigas/permissivas para evitar conflitos
DROP POLICY IF EXISTS "profiles_demo_all" ON public.profiles;
DROP POLICY IF EXISTS "face_reg_demo_all" ON public.face_registrations;
DROP POLICY IF EXISTS "audit_logs_demo_all" ON public.security_audit_logs;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
DROP POLICY IF EXISTS "face_reg_select_own" ON public.face_registrations;
DROP POLICY IF EXISTS "face_reg_insert_own" ON public.face_registrations;
DROP POLICY IF EXISTS "face_reg_update_own" ON public.face_registrations;
DROP POLICY IF EXISTS "audit_logs_select_authenticated" ON public.security_audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_events" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Permitir leitura de perfis biométricos" ON public.profiles;
DROP POLICY IF EXISTS "Permitir inserção de perfis biométricos" ON public.profiles;
DROP POLICY IF EXISTS "Permitir atualização de perfis biométricos" ON public.profiles;
DROP POLICY IF EXISTS "Permitir exclusão de perfis biométricos" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Permitir leitura de logs de auditoria" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Permitir inserção de logs de auditoria" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Permitir exclusão de logs de auditoria" ON public.security_audit_logs;

-- 6. CORREÇÃO 2: Políticas RLS Restritas (Apenas o próprio usuário autenticado)

-- TABELA PROFILES:
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- TABELA FACE_REGISTRATIONS:
CREATE POLICY "face_reg_select_own"
  ON public.face_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "face_reg_insert_own"
  ON public.face_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "face_reg_update_own"
  ON public.face_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- TABELA SECURITY_AUDIT_LOGS:
CREATE POLICY "audit_logs_select_authenticated"
  ON public.security_audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- Permite registrar eventos de segurança (inserção apenas)
CREATE POLICY "audit_logs_insert_events"
  ON public.security_audit_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- IMPORTANTE: Nenhuma política de UPDATE é criada (Logs são imutáveis / Append-Only).

-- 7. FUNÇÃO SEGURA DE VERIFICAÇÃO FACIAL NO SERVIDOR (PRÉ-LOGIN)
-- Permite comparar a imagem da câmera com o banco sem vazar os dados via SELECT direto.
CREATE OR REPLACE FUNCTION public.verify_face_match(
  candidate_descriptor jsonb,
  threshold double precision DEFAULT 0.58,
  device_info text DEFAULT 'Navegador Web',
  ip_address text DEFAULT '127.0.0.1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_rec RECORD;
  stored_arr double precision[];
  cand_arr double precision[];
  dist double precision;
  sum_sq double precision;
  i int;
  len int;
  best_match RECORD := NULL;
  min_dist double precision := 999.0;
  sim_pct numeric;
BEGIN
  -- Converter descritor de JSON para array numérico
  cand_arr := ARRAY(SELECT jsonb_array_elements_text(candidate_descriptor)::double precision);
  len := array_length(cand_arr, 1);

  IF len IS NULL OR len <> 128 THEN
    RETURN jsonb_build_object('matched', false, 'message', 'Vetor inválido. Esperadas 128 dimensões.');
  END IF;

  -- Comparar com os perfis cadastrados no banco
  FOR profile_rec IN
    SELECT id, full_name, role, average_descriptor
    FROM public.profiles
    WHERE average_descriptor IS NOT NULL
  LOOP
    stored_arr := ARRAY(SELECT jsonb_array_elements_text(profile_rec.average_descriptor)::double precision);

    IF array_length(stored_arr, 1) = 128 THEN
      sum_sq := 0.0;
      FOR i IN 1..128 LOOP
        sum_sq := sum_sq + ((cand_arr[i] - stored_arr[i]) ^ 2);
      END LOOP;
      dist := sqrt(sum_sq);

      IF dist < min_dist THEN
        min_dist := dist;
        best_match := profile_rec;
      END IF;
    END IF;
  END LOOP;

  sim_pct := round(greatest(0.0, least(100.0, (1.0 - (min_dist / 1.4142)) * 100.0))::numeric, 2);

  -- Se encontrou match dentro da margem permitida
  IF best_match IS NOT NULL AND min_dist <= threshold THEN
    INSERT INTO public.security_audit_logs (
      user_name, status, similarity, distance, liveness_score, ip_mock, device_info, timestamp
    ) VALUES (
      best_match.full_name, 'AUTHORIZED', sim_pct, round(min_dist::numeric, 4), 100.0, ip_address, device_info, now()
    );

    RETURN jsonb_build_object(
      'matched', true,
      'user_id', best_match.id,
      'full_name', best_match.full_name,
      'role', best_match.role,
      'distance', round(min_dist::numeric, 4),
      'similarity', sim_pct
    );
  ELSE
    INSERT INTO public.security_audit_logs (
      user_name, status, similarity, distance, liveness_score, ip_mock, device_info, timestamp
    ) VALUES (
      COALESCE(best_match.full_name, 'Desconhecido'), 'DENIED', sim_pct, round(min_dist::numeric, 4), 0.0, ip_address, device_info, now()
    );

    RETURN jsonb_build_object(
      'matched', false,
      'distance', round(min_dist::numeric, 4),
      'similarity', sim_pct,
      'message', 'Rosto não reconhecido.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_face_match(jsonb, double precision, text, text) TO anon, authenticated;
