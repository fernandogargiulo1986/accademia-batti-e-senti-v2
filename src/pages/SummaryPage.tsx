import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface SummaryRow {
  key: string;
  studentNome: string;
  teacherNome: string;
  counts: Record<string, number>;
}

interface SummaryResult {
  months: string[];
  rows: SummaryRow[];
  from: string;
  to: string;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
}

export function SummaryPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SummaryResult | null>(null);

  async function generate() {
    setError('');
    setResult(null);

    if (!from || !to) {
      setError('Seleziona un intervallo di date.');
      return;
    }
    if (to < from) {
      setError('La data di fine deve essere successiva alla data di inizio.');
      return;
    }

    setLoading(true);

    const [{ data: appointments, error: apptError }, { data: allStudents, error: studentsError }] = await Promise.all([
      supabase
        .from('appuntamenti')
        .select('data_inizio, studente_id(id, nome), insegnante_id(id, nome)')
        .gte('data_inizio', `${from}T00:00:00`)
        .lte('data_inizio', `${to}T23:59:59`)
        .order('data_inizio', { ascending: true }),
      supabase.from('profiles').select('id, nome').eq('ruolo', 'student').order('nome'),
    ]);

    setLoading(false);

    if (apptError) { setError('Errore: ' + apptError.message); return; }
    if (studentsError) { setError('Errore: ' + studentsError.message); return; }

    const months: string[] = [];
    const cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    cursor.setDate(1);
    end.setDate(1);
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Raggruppa per coppia studente+insegnante: se uno studente ha avuto
    // lezioni con piu insegnanti nel periodo, compare una riga per ciascuno.
    type AptRow = {
      data_inizio: string;
      studente_id: { id: string; nome: string } | null;
      insegnante_id: { id: string; nome: string } | null;
    };

    const rowMap = new Map<string, SummaryRow>();
    const studentsWithLessons = new Set<string>();

    (appointments as unknown as AptRow[] | null)?.forEach((apt) => {
      const student = apt.studente_id;
      if (!student) return;
      studentsWithLessons.add(student.id);

      const teacher = apt.insegnante_id;
      const key = `${student.id}|${teacher?.id ?? 'none'}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, { key, studentNome: student.nome, teacherNome: teacher?.nome ?? 'N/D', counts: {} });
      }
      const monthKey = apt.data_inizio.slice(0, 7);
      const row = rowMap.get(key)!;
      row.counts[monthKey] = (row.counts[monthKey] ?? 0) + 1;
    });

    // Include anche gli studenti senza alcuna lezione nel periodo.
    allStudents?.forEach((s) => {
      if (!studentsWithLessons.has(s.id)) {
        rowMap.set(`${s.id}|none`, { key: `${s.id}|none`, studentNome: s.nome, teacherNome: 'N/D', counts: {} });
      }
    });

    const rows = [...rowMap.values()].sort((a, b) =>
      a.studentNome.localeCompare(b.studentNome) || a.teacherNome.localeCompare(b.teacherNome)
    );
    setResult({ months, rows, from, to });
  }

  function downloadExcel() {
    if (!result) return;
    const { months, rows, from, to } = result;

    const header = ['Studente', 'Insegnante', ...months.map(monthLabel), 'Totale'];
    const dataRows = rows.map((r) => {
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      return [r.studentNome, r.teacherNome, ...months.map((m) => r.counts[m] ?? 0), total];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riepilogo Lezioni');
    XLSX.writeFile(wb, `riepilogo_lezioni_${from}_${to}.xlsx`);
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md flex-grow overflow-auto">
      <h2 className="text-2xl font-bold mb-4">Riepilogo Lezioni per Studente</h2>

      <div className="flex flex-wrap gap-4 items-end mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dal</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Al</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? 'Caricamento...' : 'Genera riepilogo'}
        </button>
        {result && (
          <button
            onClick={downloadExcel}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
          >
            Scarica Excel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Studente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Insegnante</th>
                {result.months.map((m) => (
                  <th key={m} className="px-4 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">{monthLabel(m)}</th>
                ))}
                <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">Totale</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {result.rows.map((r) => {
                const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
                return (
                  <tr key={r.key}>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.studentNome}</td>
                    <td className="px-4 py-3 text-gray-700">{r.teacherNome}</td>
                    {result.months.map((m) => (
                      <td key={m} className="px-4 py-3 text-center text-gray-700">{r.counts[m] ?? 0}</td>
                    ))}
                    <td className="px-4 py-3 text-center font-bold text-indigo-700">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
