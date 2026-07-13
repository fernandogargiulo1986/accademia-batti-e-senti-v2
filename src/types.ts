import type { Ruolo } from './lib/database.types';

export type { Ruolo };

export interface Profile {
  id: string;
  nome: string;
  email: string;
  ruolo: Ruolo;
  aula_default_id: string | null;
}

export interface AdminProfile extends Profile {
  aula_default_nome: string | null;
}

export interface Aula {
  id: string;
  nome: string;
}

export interface AppuntamentoRelations {
  id: string;
  data_inizio: string;
  data_fine: string;
  note: string | null;
  studente_id: { id: string; nome: string } | null;
  insegnante_id: { id: string; nome: string } | null;
  aula_id: { id: string; nome: string } | null;
}

export interface OccupiedSlot {
  data_inizio: string;
  data_fine: string;
  insegnante_id: string;
  aula_nome: string | null;
}
