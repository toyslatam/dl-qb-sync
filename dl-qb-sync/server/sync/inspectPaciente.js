import 'dotenv/config';
import {
  getPaciente,
  getPagosByPaciente,
  getTratamientosByPaciente,
  getDetalleTratamiento,
} from '../integrations/dentalink.js';

// Uso: node server/sync/inspectPaciente.js --paciente=12345
// Imprime la data cruda de Dentalink para un paciente, para validar nombres de
// campos reales antes de ajustar el mapeo en invoiceSync.js.

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value];
  })
);

if (!args.paciente) {
  console.error('Uso: node server/sync/inspectPaciente.js --paciente=<id_paciente>');
  process.exit(1);
}

async function main() {
  const idPaciente = args.paciente;

  console.log('\n=== PACIENTE ===');
  console.log(JSON.stringify(await getPaciente(idPaciente), null, 2));

  console.log('\n=== PAGOS DEL PACIENTE ===');
  const pagos = await getPagosByPaciente(idPaciente);
  console.log(JSON.stringify(pagos, null, 2));

  console.log('\n=== TRATAMIENTOS DEL PACIENTE ===');
  const tratamientos = await getTratamientosByPaciente(idPaciente);
  console.log(JSON.stringify(tratamientos, null, 2));

  for (const tratamiento of tratamientos) {
    console.log(`\n=== DETALLES DEL TRATAMIENTO ${tratamiento.id} ===`);
    console.log(JSON.stringify(await getDetalleTratamiento(tratamiento.id), null, 2));
  }
}

main().catch((err) => {
  console.error('Error inspeccionando paciente:', err);
  process.exit(1);
});
