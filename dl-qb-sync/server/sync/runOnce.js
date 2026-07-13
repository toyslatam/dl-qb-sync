import 'dotenv/config';
import { runSyncCycle, runSyncForPaciente } from './invoiceSync.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value];
  })
);

const task = args.paciente
  ? runSyncForPaciente(args.paciente)
  : runSyncCycle({ fechaDesde: args.desde, fechaHasta: args.hasta });

task
  .then((result) => {
    console.log('Sincronizacion completada:', result);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error en sincronizacion:', err);
    process.exit(1);
  });
