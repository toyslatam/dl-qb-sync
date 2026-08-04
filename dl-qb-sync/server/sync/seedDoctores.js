import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { createDoctor, findDoctorPorNombre } from '../db/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TITULOS = ['Dr(a).', 'Dra.', 'Dr.'];

/** Separa "Dr. Francisco SousaLennox" en { titulo: 'Dr.', nombre: 'Francisco', apellido: 'SousaLennox' }. */
function parseDoctor(texto) {
  const limpio = texto.trim();
  const titulo = TITULOS.find((t) => limpio.startsWith(`${t} `)) ?? 'Dr.';
  const resto = limpio.startsWith(`${titulo} `) ? limpio.slice(titulo.length + 1).trim() : limpio;
  const espacio = resto.indexOf(' ');
  if (espacio === -1) return { titulo, nombre: resto, apellido: '' };
  return { titulo, nombre: resto.slice(0, espacio).trim(), apellido: resto.slice(espacio + 1).trim() };
}

/**
 * Importa la hoja "Tabla%" del Excel de comisiones al catalogo de doctores.
 * Un solo uso -- no reimporta si el doctor (nombre+apellido) ya existe.
 * Corre con: npm run seed-doctores
 */
async function main() {
  const excelPath = path.join(__dirname, '..', '..', 'data', '0226-DentalOne-Comisiones.xlsx');
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets['Tabla%'];
  const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 'B2:H25', defval: '' });

  let creados = 0;
  let omitidos = 0;

  for (const fila of filas) {
    const [usuario, especialidad, doctorTexto, comisionPct, descTC, descClave, descYappy] = fila;
    if (!doctorTexto || typeof doctorTexto !== 'string') continue;

    const { titulo, nombre, apellido } = parseDoctor(doctorTexto);
    if (!nombre || !apellido) {
      console.warn(`Omitido (no se pudo separar nombre/apellido): "${doctorTexto}"`);
      omitidos += 1;
      continue;
    }

    const existente = await findDoctorPorNombre(nombre, apellido);
    if (existente) {
      console.log(`Ya existe: ${nombre} ${apellido}, se deja como esta`);
      omitidos += 1;
      continue;
    }

    await createDoctor({
      titulo,
      nombre,
      apellido,
      especialidad: especialidad || null,
      usuario: usuario || null,
      comision_pct: typeof comisionPct === 'number' ? comisionPct : 0,
      desc_tarjeta_credito: typeof descTC === 'number' ? descTC : null,
      desc_tarjeta_clave: typeof descClave === 'number' ? descClave : null,
      desc_yappy: typeof descYappy === 'number' ? descYappy : null,
    });
    console.log(`Creado: ${titulo} ${nombre} ${apellido} (${especialidad || 'sin especialidad'}, ${(comisionPct * 100).toFixed(0)}%)`);
    creados += 1;
  }

  console.log(`\nListo. Creados: ${creados}, omitidos: ${omitidos}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
