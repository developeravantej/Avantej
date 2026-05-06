CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_type text NOT NULL CHECK (client_type IN ('member','walk_in')),
  client_id text NOT NULL,
  branch_id uuid NOT NULL REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
  appointment_client_id uuid REFERENCES appointment_clients(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('booking','drop_in')),
  outcome text NOT NULL DEFAULT 'attended' CHECK (outcome IN ('attended','no_show','late_cancel')),
  package_instance_id uuid,
  credits_consumed integer NOT NULL DEFAULT 0,
  notes text,
  checked_in_by text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_ins_client_idx ON check_ins(client_type, client_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS check_ins_branch_idx ON check_ins(branch_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS check_ins_appt_client_idx ON check_ins(appointment_client_id);
CREATE INDEX IF NOT EXISTS check_ins_checked_in_at_idx ON check_ins(checked_in_at DESC);
