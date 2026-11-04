/* The supervision list, grouped the same way everywhere it is shown — the
   kitchen's panel, the plain page and the console's students.txt. A PhD and a
   master's internship are different kinds of supervision, so they are listed
   apart, and theses in progress come before defended ones. */
import students from './students.json';

export interface Student {
  name: string; topic: string; note?: string; kind: string; period: string; status: string;
}

export interface StudentGroup { id: string; label: string; rows: Student[] }

export function studentGroups(): StudentGroup[] {
  const all = students as Student[];
  const phd = all.filter((s) => s.kind === 'PhD');
  const groups: StudentGroup[] = [
    { id: 'phd-current', label: 'PhD — in progress', rows: phd.filter((s) => s.status === 'current') },
    { id: 'phd-defended', label: 'PhD — defended', rows: phd.filter((s) => s.status !== 'current') },
    { id: 'masters', label: 'Master’s', rows: all.filter((s) => s.kind !== 'PhD') },
  ];
  return groups.filter((g) => g.rows.length);
}
